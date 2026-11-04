/**
`package.json` fallback loader — the `"nodeloop"` key holds the config.
A broken package.json is NOT our problem here: it is ignored (legacy
parity) so a syntax error in unrelated package metadata cannot kill the
runner when no earlier config file matched.
*/
import fs from 'node:fs';
import { stripBOM } from './json.js';

/**
@param packagePath absolute path to package.json
@returns the raw `nodeloop` config object, or null when absent/broken
*/
export function loadPackageJsonConfig(packagePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(packagePath)) {
    // This exported loader uses null to represent absent or invalid package metadata.
    return null;
  }
  let package_: Record<string, unknown>;
  try {
    package_ = JSON.parse(stripBOM(fs.readFileSync(packagePath, 'utf8'))) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  // This exported loader uses null to represent an absent nodeloop key.
  return package_['nodeloop'] === undefined
    ? null
    : (package_['nodeloop'] as Record<string, unknown>);
}
