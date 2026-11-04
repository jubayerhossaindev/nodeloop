/**
Path helpers shared by the option modules, the script resolver and the
runtime. Small, pure, and injectable-friendly — mirrors the `node:path`
usage inside the legacy `cli.js` / `lib/watch.js`.
*/
import path from 'node:path';
import fs from 'node:fs';

/**
Resolve `script` against `cwd` (absolute paths pass through untouched).
*/
export function resolveFromCwd(cwd: string, script: string): string {
  return path.resolve(cwd, script);
}

/**
Path relative to `cwd` for display; falls back to the absolute path.
*/
export function displayPath(cwd: string, target: string): string {
  const related = path.relative(cwd, target);
  return related === '' ? target : related;
}

/**
`path.extname(p).slice(1).toLowerCase()` — the way the legacy runtime derives a script's ext.
*/
export function extensionNameLower(p: string): string {
  return path.extname(p).slice(1).toLowerCase();
}

/**
Short alias for `extensionNameLower`.
*/
export const extNameLower = extensionNameLower;

/**
existsSync wrapper kept as an exported indirection so tests can stub `fs`.
*/
export function isFileExists(p: string): boolean {
  return fs.existsSync(p);
}

/**
Short alias for `isFileExists`.
*/
export const fileExists = isFileExists;

/**
statSync().isDirectory() with a swallow — "gone" behaves like "not a dir".
*/
export function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
