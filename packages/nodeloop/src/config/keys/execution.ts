/**
Execution keys: `script`, `scriptArgs` — plus the nodemon-compatible
`args` alias (routed here by keys/aliases.ts).
*/
import type { KeyParser } from './types.js';

/**
`script`: non-empty string, trimmed.
*/
export const parseScript: KeyParser = (value) => {
  return typeof value === 'string' && value.trim()
    ? { ok: true, set: { script: value.trim() } }
    : { ok: false };
};

/**
`scriptArgs` / `args`: array of strings or numbers — everything the child
receives after the script. Numbers are stringified (legacy parity).
*/
export const parseScriptArguments: KeyParser = (value) => {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')
    ? { ok: true, set: { scriptArgs: value.map(String) } }
    : { ok: false };
};

/**
Nodemon-compatible alias for `scriptArgs`.
*/
export const parseScriptArgs = parseScriptArguments;
