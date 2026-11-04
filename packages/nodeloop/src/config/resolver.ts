/**
Configuration resolution — the public entry points, an exact port of
`lib/config.js loadConfig` / `loadConfigFile`:

  • loadConfig(cwd): auto-detect (first match wins), then the
    package.json `"nodeloop"` key as the last resort;
  • loadConfigFile(file): one explicit file (--config).

NEITHER throws — failures come back as `{ error }` so the CLI can print
the invalid-configuration block and exit 1 (watcher claims nothing).
*/
import fs from 'node:fs';
import path from 'node:path';
import type { ConfigLoadResult, NormalizedConfig } from './schema.js';
import { detectConfigFile } from './detection.js';
import { readConfigFile } from './loaders/index.js';
import { loadPackageJsonConfig } from './loaders/package-json.js';
import { sanitizeConfig } from './validator.js';

function errorMessage(error: unknown): string {
  /* c8 ignore start — defensive: loaders always throw real Errors */
  return error instanceof Error ? error.message : String(error);
  /* c8 ignore end */
}

function ok(
  config: NormalizedConfig,
  file: string | null | undefined,
  unknownKeys: string[],
  badKeys: string[]
): ConfigLoadResult {
  return { config, file, unknownKeys, badKeys, error: null };
}

function failed(file: string | null, error: unknown): ConfigLoadResult {
  return { config: {}, file, unknownKeys: [], badKeys: [], error: new Error(errorMessage(error)) };
}

/**
Load configuration from the auto-detection chain.
@param cwd directory to scan (defaults to process.cwd())
*/
export function loadConfig(cwd: string = process.cwd()): ConfigLoadResult {
  const detected = detectConfigFile(cwd);
  if (detected) {
    const name = path.basename(detected);
    try {
      const raw = readConfigFile(detected);
      const { values, unknownKeys, badKeys } = sanitizeConfig(raw);
      return ok(values, detected, unknownKeys, badKeys);
    } catch (error) {
      return failed(detected, new Error(`${name}: ${errorMessage(error)}`));
    }
  }

  // last resort: "nodeloop" key inside package.json
  const packagePath = path.join(cwd, 'package.json');
  if (fs.existsSync(packagePath)) {
    const raw = loadPackageJsonConfig(packagePath);
    if (raw !== null) {
      try {
        const { values, unknownKeys, badKeys } = sanitizeConfig(raw);
        return ok(values, packagePath, unknownKeys, badKeys);
      } catch (error) {
        return failed(packagePath, new Error(`package.json: ${errorMessage(error)}`));
      }
    }
  }

  return ok({}, null, [], []);
}

/**
Load ONE explicit config file (the CLI `--config <file>` flag).
Same return shape as loadConfig — never throws.
@param file absolute or cwd-relative path
*/
export function loadConfigFile(file: string): ConfigLoadResult {
  try {
    if (!fs.existsSync(file)) {
      throw new Error('config file not found');
    }
    const raw = readConfigFile(file);
    const { values, unknownKeys, badKeys } = sanitizeConfig(raw);
    return ok(values, file, unknownKeys, badKeys);
  } catch (error) {
    return failed(file, new Error(`${path.basename(file)}: ${errorMessage(error)}`));
  }
}
