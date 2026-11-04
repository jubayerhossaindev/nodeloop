/**
Terminal keys: `verbose`, `quiet` and `colours` (alias `colors` — the US
spelling is accepted and normalized onto the British key, legacy parity).
*/
import type { KeyParser } from './types.js';

/**
`verbose`: strict boolean.
*/
export const parseVerbose: KeyParser = (value) => {
  return typeof value === 'boolean' ? { ok: true, set: { verbose: value } } : { ok: false };
};

/**
`quiet`: strict boolean.
*/
export const parseQuiet: KeyParser = (value) => {
  return typeof value === 'boolean' ? { ok: true, set: { quiet: value } } : { ok: false };
};

/**
`colours` / `colors`: strict boolean controlling the ANSI palette.
*/
export const parseColours: KeyParser = (value) => {
  return typeof value === 'boolean' ? { ok: true, set: { colours: value } } : { ok: false };
};
