/**
Native binary loader — locate, require and contract-check the
`nodeloop-native` addon. Search order:

  1. `NODELOOP_NATIVE_PATH` — explicit override (tests, custom builds);
  2. the installed platform package `@nodeloop/native-<platform>-<arch>`
     (optional dependency of the published npm layout);
  3. a locally built workspace binary: `<repo>/target/release/` — the
     `npm run build:native` output, so a monorepo checkout works
     without any publish step.

Every candidate is contract-checked (`NativeModule` shape); a binary
that does not honor the contract raises NativeContractError, a missing
one raises NativeLoadError — both PREDICTABLE (spec §9).
*/
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeContractError, NativeLoadError } from './errors.js';
import type { NativeBinding, NativeModule } from './types.js';

const nodeRequire = createRequire(import.meta.url);

/**
The contract surface every binding must expose.
*/
const REQUIRED_EXPORTS: readonly string[] = [
  'coreVersion',
  'watcherStart',
  'watcherStop',
  'watcherRestart',
  'watcherWriteStdin',
  'watcherChildAlive',
  'resolveSpawn'
];

/**
File names cargo emits for a cdylib per host platform (+ the npm .node name).
*/
function candidateFileNames(): string[] {
  const base = 'nodeloop_native';
  if (process.platform === 'win32') {
    return [`${base}.node`, `${base}.dll`];
  }
  if (process.platform === 'darwin') {
    return [`${base}.node`, `lib${base}.dylib`];
  }
  return [`${base}.node`, `${base}.so`, `lib${base}.so`];
}

/**
Convert process.platform-arch to the napi-rs prebuild target triple.
napi-rs uses e.g. linux-x64-gnu, darwin-arm64, win32-x64-msvc while
process.platform + '-' + process.arch gives linux-x64, darwin-arm64,
win32-x64. Adds the missing -gnu / -msvc suffixes.
*/
function napiTargetTriple(): string {
  const base = `${process.platform}-${process.arch}`;
  if (process.platform === 'linux') {
    return `${base}-gnu`;
  }
  if (process.platform === 'win32') {
    return `${base}-msvc`;
  }
  return base;
}

/**
Platform package name for the npm optional-dependency layout.
*/
export function platformPackageName(): string {
  return `@nodeloop/native-${napiTargetTriple()}`;
}

/**
Locate the release directory of the workspace cargo build.
*/
function workspaceReleaseDirectories(): string[] {
  // this module lives at <repo>/packages/nodeloop/dist|src/native/loader.js
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(here, '..', '..', '..', '..');
  return [
    path.join(repositoryRoot, 'target', 'release'),
    path.join(repositoryRoot, 'target', 'debug')
  ];
}

function tryLoad(file: string): NativeBinding | undefined {
  if (!fs.existsSync(file)) {
    return undefined;
  }
  const module_ = nodeRequire(file) as Record<string, unknown>;
  return module_ as unknown as NativeBinding;
}

function assertContract(module_: NativeModule): void {
  for (const name of REQUIRED_EXPORTS) {
    if (typeof (module_ as unknown as Record<string, unknown>)[name] !== 'function') {
      throw new NativeContractError(`missing export "${name}"`);
    }
  }
}

/**
Load and contract-check the native binding.
@throws NativeLoadError (nothing usable found) or NativeContractError
*/
export function loadNativeBinding(): NativeBinding {
  const errors: string[] = [];

  // 1. explicit override
  const override = process.env['NODELOOP_NATIVE_PATH'];
  if (override) {
    if (!fs.existsSync(override)) {
      throw new NativeLoadError(`NODELOOP_NATIVE_PATH points at a missing file: ${override}`);
    }
    let module_: NativeBinding | undefined;
    try {
      module_ = tryLoad(override);
    } catch (error) {
      // a file that exists but is NOT a loadable addon (garbage text, wrong arch…)
      throw new NativeContractError(
        `NODELOOP_NATIVE_PATH is not a loadable addon: ${override} (${
          error instanceof Error ? error.message.split('\n', 1)[0] : String(error)
        })`
      );
    }
    /* v8 ignore start — tryLoad only returns undefined for a missing file, which
       the existsSync check above already rejected. Kept as a guard. */
    if (!module_) {
      throw new NativeLoadError(`NODELOOP_NATIVE_PATH is not a loadable addon: ${override}`);
    }
    /* v8 ignore end */
    assertContract(module_);
    return module_;
  }

  // 2. installed platform package (@nodeloop/native-<target>) — primary for npm install users
  try {
    const packageFile = nodeRequire.resolve(`${platformPackageName()}/package.json`);
    const package_ = JSON.parse(fs.readFileSync(packageFile, 'utf8')) as { main?: string };
    if (package_.main) {
      const file = path.resolve(path.dirname(packageFile), package_.main);
      const module_ = tryLoad(file);
      if (module_) {
        assertContract(module_);
        return module_;
      }
    }
  } catch (error) {
    if (error instanceof NativeContractError) {
      throw error;
    }
    errors.push(`${platformPackageName()} not installed`);
  }

  // 3. workspace cargo build output (local dev fallback)
  for (const direction of workspaceReleaseDirectories()) {
    for (const name of candidateFileNames()) {
      const file = path.join(direction, name);
      try {
        const module_ = tryLoad(file);
        if (module_) {
          assertContract(module_);
          return module_;
        }
      } catch (error) {
        if (error instanceof NativeContractError) {
          throw error;
        }
        errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  throw new NativeLoadError(
    `no binary found for ${process.platform}-${process.arch}${errors.length > 0 ? ` (${errors[0]})` : ''}`
  );
}

/**
Cheap availability probe that does NOT throw — used by tooling and tests.
*/
export function isNativeAvailable(): boolean {
  try {
    loadNativeBinding();
    return true;
  } catch {
    return false;
  }
}
