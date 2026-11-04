/**
Native loader — the search-order matrix beyond the happy path:
platform-package resolution (via a patched Module._resolveFilename, no
node_modules pollution), platform-name variants, contract failures and
the workspace fallback reporting.

The "nothing usable exists" scenario is simulated at the node:module
seam: dlopening a swapped-out addon file is both racy (worker-level
module caches) and dangerous (SIGBUS when a mapped addon is replaced),
so the failure is injected where the loader actually calls into require.
*/
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as NodeModuleNS from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type * as ModuleActual from 'node:module';

type ModuleNS = typeof ModuleActual & {
  __setDlopenFailPrefixes?: (prefixes: string[]) => void;
  __setPlatformResolveFail?: (isFail: boolean) => void;
};

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal();
  let failPrefixes: string[] = [];
  let isFailPlatformResolve = false;
  const wrapped = {
    ...actual,
    createRequire: (url: string | URL) => {
      const real = actual.createRequire(url);
      const function_ = ((id: string) => {
        if (failPrefixes.some((p) => id.startsWith(p))) {
          throw new Error(`${id}: invalid ELF header (simulated dlopen failure)`);
        }
        return real(id);
      }) as NodeJS.Require;
      Object.defineProperty(function_, 'cache', { get: () => real.cache });
      (function_ as unknown as { resolve: typeof real.resolve }).resolve = (
        id: string,
        o?: unknown
      ) => {
        if (isFailPlatformResolve && id.startsWith('@nodeloop/native-')) {
          throw new Error(`Cannot find module '${id}' (simulated)`);
        }
        return real.resolve(id, o);
      };
      return function_;
    },
    __setDlopenFailPrefixes: (prefixes: string[]) => {
      failPrefixes = prefixes;
    },
    __setPlatformResolveFail: (isFail: boolean) => {
      isFailPlatformResolve = isFail;
    }
  };
  return wrapped;
});

import {
  loadNativeBinding,
  isNativeAvailable,
  platformPackageName,
  NativeLoadError,
  NativeContractError
} from '../../../src/native/loader.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(testDirectory, '../../../../..');
const REAL_BINDING = path.join(REPO_ROOT, 'target', 'release', 'nodeloop_native.node');

const environmentSaved = process.env.NODELOOP_NATIVE_PATH;
afterEach(() => {
  (NodeModuleNS as unknown as ModuleNS).__setDlopenFailPrefixes?.([]);
  (NodeModuleNS as unknown as ModuleNS).__setPlatformResolveFail?.(false);
  if (environmentSaved === undefined) {
    delete process.env.NODELOOP_NATIVE_PATH;
  } else {
    process.env.NODELOOP_NATIVE_PATH = environmentSaved;
  }
});

function stubPlatform(value: string): () => void {
  const desc = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value });
  return () => Object.defineProperty(process, 'platform', desc);
}

function patchResolve(fakeMap: Record<string, string>): () => void {
  /* _resolveFilename is a STATIC on the Module class — patch that, not the
     namespace object (require() consults the class property). */
  const module_ = (NodeModuleNS as unknown as { default: Record<string, unknown> })
    .default as unknown as { _resolveFilename: (...a: unknown[]) => string };
  const original = module_._resolveFilename;
  module_._resolveFilename = function (request: unknown, ...rest: unknown[]) {
    const fake = fakeMap[String(request)];
    return fake || original.call(module_, request, ...rest);
  };
  return () => {
    module_._resolveFilename = original;
  };
}

describe('platformPackageName', () => {
  it('maps linux x64/arm64 to the -gnu packages', () => {
    expect(platformPackageName()).toBe(`@nodeloop/native-linux-${process.arch}-gnu`);
    const archDesc = Object.getOwnPropertyDescriptor(process, 'arch')!;
    Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
    expect(platformPackageName()).toBe('@nodeloop/native-linux-arm64-gnu');
    Object.defineProperty(process, 'arch', archDesc);
  });

  it('maps win32 to the -msvc packages and darwin to plain pairs', () => {
    const archDesc = Object.getOwnPropertyDescriptor(process, 'arch')!;
    Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
    const restore = stubPlatform('win32');
    try {
      expect(platformPackageName()).toBe('@nodeloop/native-win32-x64-msvc');
    } finally {
      restore();
      Object.defineProperty(process, 'arch', archDesc);
    }
    const restoreDarwin = stubPlatform('darwin');
    try {
      expect(platformPackageName()).toBe('@nodeloop/native-darwin-x64');
    } finally {
      restoreDarwin();
    }
  });
});

describe('NODELOOP_NATIVE_PATH override', () => {
  it('a missing override raises the predictable load error', () => {
    process.env.NODELOOP_NATIVE_PATH = '/definitely/not/here.node';
    expect(() => loadNativeBinding()).toThrow(NativeLoadError);
    expect(isNativeAvailable()).toBe(false);
  });

  it('a loadable-but-foreign module raises the contract error (missing exports)', () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-loader-'));
    const fakeJs = path.join(direction, 'foreign.js');
    fs.writeFileSync(fakeJs, 'module.exports = { hello: () => 1 };');
    process.env.NODELOOP_NATIVE_PATH = fakeJs;
    try {
      expect(() => loadNativeBinding()).toThrow(NativeContractError);
      expect(() => loadNativeBinding()).toThrow(/missing export "coreVersion"/);
    } finally {
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });

  it('a non-Error throw from the override is stringified into the contract error', () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-loader2-'));
    const fakeJs = path.join(direction, 'throwing.js');
    fs.writeFileSync(fakeJs, "module.exports = (() => { throw 'plain-string-boom'; })();");
    process.env.NODELOOP_NATIVE_PATH = fakeJs;
    try {
      expect(() => loadNativeBinding()).toThrow(NativeContractError);
      expect(() => loadNativeBinding()).toThrow(/plain-string-boom/);
    } finally {
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });
});

describe('installed platform package lookup', () => {
  it('a platform package with a REAL binding main is loaded and contract-checked', () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-pkg-'));
    const bindingCopy = path.join(direction, 'binding.node');
    fs.copyFileSync(REAL_BINDING, bindingCopy);
    const packageFile = path.join(direction, 'package.json');
    fs.writeFileSync(
      packageFile,
      JSON.stringify({ name: '@nodeloop/native-linux-x64-gnu', main: 'binding.node' })
    );
    const restore = patchResolve({ '@nodeloop/native-linux-x64-gnu/package.json': packageFile });
    try {
      const binding = loadNativeBinding();
      expect(binding.coreVersion()).toBe('1.0.0');
    } finally {
      restore();
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });

  it('a platform package WITHOUT main falls through to the workspace build', () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-pkg2-'));
    const packageFile = path.join(direction, 'package.json');
    fs.writeFileSync(packageFile, JSON.stringify({ name: '@nodeloop/native-linux-x64-gnu' }));
    const restore = patchResolve({ '@nodeloop/native-linux-x64-gnu/package.json': packageFile });
    try {
      const binding = loadNativeBinding(); // workspace fallback supplies the binary
      expect(typeof binding.watcherStart).toBe('function');
    } finally {
      restore();
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });
});

describe('workspace fallback — every platform candidate name is probed', () => {
  it('reports the accumulated dlopen errors when nothing usable exists', () => {
    // simulate a machine with no platform package and no usable binary:
    // the installed platform package must not resolve, and every workspace
    // candidate must isFail to dlopen
    (NodeModuleNS as unknown as ModuleNS).__setDlopenFailPrefixes?.([
      path.join(REPO_ROOT, 'target', 'release'),
      path.join(REPO_ROOT, 'target', 'debug')
    ]);
    (NodeModuleNS as unknown as ModuleNS).__setPlatformResolveFail?.(true);
    try {
      // linux (real platform): .node / .so / lib*.so all isFail
      delete process.env.NODELOOP_NATIVE_PATH;
      expect(() => loadNativeBinding()).toThrow(NativeLoadError);
      // errors[0] is the platform-package miss; the workspace dlopen failures follow
      expect(() => loadNativeBinding()).toThrow(/no binary found for linux-x64/);
      // win32 candidate names (.node + .dll)
      const restoreWin = stubPlatform('win32');
      try {
        expect(() => loadNativeBinding()).toThrow(NativeLoadError);
      } finally {
        restoreWin();
      }
      // darwin candidate names (.node + .dylib)
      const restoreMac = stubPlatform('darwin');
      try {
        expect(() => loadNativeBinding()).toThrow(NativeLoadError);
      } finally {
        restoreMac();
      }
      expect(isNativeAvailable()).toBe(false);
    } finally {
      (NodeModuleNS as unknown as ModuleNS).__setDlopenFailPrefixes?.([]);
      (NodeModuleNS as unknown as ModuleNS).__setPlatformResolveFail?.(false);
    }
  });

  it('finds the real binary again after the simulated failure is lifted', () => {
    const binding = loadNativeBinding();
    expect(binding.coreVersion()).toBe('1.0.0');
    expect(isNativeAvailable()).toBe(true);
  });
});
