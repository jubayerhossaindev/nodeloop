/**
`events` — custom lifecycle status messages. The config can replace
nodeloop's default banners with its own lines for exactly five moments:
start / restart / crash / exit / quit. Unknown event names or non-string
values make the whole key a badKey (legacy parity — all or nothing).
*/
import { EVENT_KEYS } from '../schema.js';
import type { KeyParser } from './types.js';

export const parseEvents: KeyParser = (value) => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(([k, v]) => EVENT_KEYS.has(k) && typeof v === 'string')
  ) {
    return {
      ok: true,
      set: { events: value }
    };
  }
  return { ok: false };
};
