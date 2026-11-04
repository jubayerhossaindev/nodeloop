/**
JavaScript/TypeScript config loader — `nodeloop.js`, `.cjs`, `.mjs`,
`.ts`, `.mts`.

Loaded with `require()` exactly like the legacy `readConfigFile`:
  • `.cjs` is always CommonJS; `.mjs`/`.mts` are always ESM; `.js`/`.ts`
    follow the nearest package.json "type" (Node's own rule);
  • Node ≥ 22.12 `require()`s ESM; Node ≥ 22.18 strips TS types — older
    runtimes throw the extension errors the hint below explains;
  • a `default` export is unwrapped;
  • the silent-empty trap is detected: `module.exports = {…}` inside a
    "type": "module" project loads as an empty object — never let that
    look like "no config".
*/
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const nodeRequire = createRequire(import.meta.url);

/**
Extension-aware hint for a failed nodeloop.js/.mjs/.ts/.mts/.cjs config.
The generic advice ("write module.exports") is WRONG for .mjs/.mts —
those are always ESM — and .ts on Node < 22.18 fails with a
file-extension error that has nothing to do with ESM vs CommonJS.
*/
export function jsTsHint(file: string, message: string, source: string): string {
  const extension = path.extname(file).toLowerCase();
  const base = path.basename(file);
  if (extension === '.mjs' || extension === '.mts') {
    return (
      ` — hint: ${base} is always ESM: use \`export default { … }\`` +
      ' (require()-ing it needs Node >= 22.12)'
    );
  }
  /* Only reachable on Node < 22.18 where require()-ing .ts throws
     "unknown file extension" — newer runtimes strip types instead. */
  /* v8 ignore start */
  if (extension === '.ts' && /unknown file extension/iu.test(message)) {
    return (
      ' — hint: .ts configs need Node >= 22.18 (or Node 22.6–22.17 with' +
      ' --experimental-strip-types) — on older Node, use nodeloop.json'
    );
  }
  /* v8 ignore end */
  const isUsesEsmSyntax = /(^|\n)\s*(export\s+(default|\{|\*)|import[\s{*'])/u.test(source);
  /* Only reachable on Node < 22.12, where require()-ing ESM syntax in a
     CommonJS file throws a SyntaxError. Newer runtimes load it fine. */
  /* v8 ignore start */
  return isUsesEsmSyntax
    ? ' — hint: this project is CommonJS: write `module.exports = { … }` instead of `export default`, or rename the file to nodeloop.mts'
    : ' — hint: write `module.exports = { … }` (CommonJS) or `export default { … }` in an ESM project / nodeloop.mts';
  /* v8 ignore end */
}

/**
Load a JS/TS config module and return its exported object.
@throws Error (with the extension-aware hint appended) on any load failure
*/
export function loadJsTsConfig(file: string): unknown {
  const source = fs.readFileSync(file, 'utf8');
  let module_: unknown;
  try {
    delete nodeRequire.cache[nodeRequire.resolve(file)];
    module_ = nodeRequire(file); // Node ≥22.12 also loads ESM; ≥22.18 strips .ts types
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}${jsTsHint(file, message, source)}`, { cause: error });
  }

  const out =
    module_ &&
    typeof module_ === 'object' &&
    'default' in (module_ as Record<string, unknown>) &&
    (module_ as Record<string, unknown>)['default'] !== null &&
    (module_ as Record<string, unknown>)['default'] !== undefined
      ? (module_ as Record<string, unknown>)['default']
      : module_;

  // Silent-empty trap: `module.exports = {…}` inside a "type": "module"
  // project loads as an empty object. Never let that look like "no config".
  if (
    (out === null || (typeof out === 'object' && Object.keys(out).length === 0)) &&
    /module\s*\.\s*exports/u.test(source)
  ) {
    throw new Error(
      'config evaluated to an empty object — this project is ESM ("type": "module"): ' +
        'use `export default { … }`, or rename the file to nodeloop.mts'
    );
  }
  return out;
}
