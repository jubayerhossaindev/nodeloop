/**
Watch-scope keys: `ext`, `ignore`, `watch` and the legacy-polling switch
`legacyWatch`. String-or-array coercion mirrors `lib/config.js` exactly.
*/
import type { KeyParser } from './types.js';

/**
`ext`: "js,json" string or non-empty array — stored comma-joined.
*/
export const parseExtension: KeyParser = (value) => {
  if (typeof value === 'string' && value.trim()) {
    return { ok: true, set: { ext: value } };
  }
  if (Array.isArray(value) && value.length > 0) {
    return { ok: true, set: { ext: value.map(String).join(',') } };
  }
  return { ok: false };
};

/**
Nodemon-compatible short alias for `parseExtension`.
*/
export const parseExt = parseExtension;

/**
`ignore`: one name or a list of names.
*/
export const parseIgnore: KeyParser = (value) => {
  if (typeof value === 'string' && value.trim()) {
    return { ok: true, set: { ignore: [value] } };
  }
  if (Array.isArray(value) && value.length > 0) {
    return { ok: true, set: { ignore: value.map(String) } };
  }
  return { ok: false };
};

/**
`watch`: one prefix or a list of prefixes (string | string[] kept as-is).
*/
export const parseWatch: KeyParser = (value) => {
  if (typeof value === 'string' && value.trim()) {
    return { ok: true, set: { watch: value } };
  }
  if (Array.isArray(value) && value.length > 0) {
    return { ok: true, set: { watch: value.map(String) } };
  }
  return { ok: false };
};

/**
`legacyWatch`: true → poll every 1s; false → fs.watch; number ≥ 50 → that
interval in ms. Anything else is a bad key.
*/
export const parseLegacyWatch: KeyParser = (value) => {
  if (value === true || value === false) {
    return { ok: true, set: { legacyWatch: value } };
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 50) {
    return { ok: true, set: { legacyWatch: value } };
  }
  return { ok: false };
};
