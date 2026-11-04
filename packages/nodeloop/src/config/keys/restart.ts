/**
Restart-timing keys: `delay`, `maxWait` and the manual-restart word
`restartable` (string — or `false` to hand the terminal to the app).
*/
import type { KeyParser } from './types.js';

/**
Shared positive-number coercion: `Number(value)` finite and > 0.
*/
function positiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
`delay`: debounce window in ms.
*/
export const parseDelay: KeyParser = (value) => {
  const n = positiveNumber(value);
  return n === undefined ? { ok: false } : { ok: true, set: { delay: n } };
};

/**
`maxWait`: force-restart cap for change bursts (0 = disabled).
*/
export const parseMaxWait: KeyParser = (value) => {
  const n = positiveNumber(value);
  return n === undefined ? { ok: false } : { ok: true, set: { maxWait: n } };
};

/**
`restartable`: the manual-restart word (default "rs"); `false` disables
stdin interception entirely.
*/
export const parseRestartable: KeyParser = (value) => {
  if (typeof value === 'string' && value.trim()) {
    return { ok: true, set: { restartable: value.trim() } };
  }
  if (value === false) {
    return { ok: true, set: { restartable: false } };
  }
  return { ok: false };
};
