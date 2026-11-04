/**
Process keys: `killSignal` (alias `signal`), `killTimeout`, `env`, `exec`,
`nodeArgs` and `execMap`. Signal validation uses the real list of signal
names Node can deliver (`os.constants.signals`) — exactly like the legacy
loader, so an invalid signal is a badKey, never a runtime surprise.
*/
import os from 'node:os';
import type { KeyParser } from './types.js';

/**
POSIX/Windows signal names Node can actually deliver.
*/
export const SIGNAL_NAMES: ReadonlySet<string> = new Set(Object.keys(os.constants.signals));

/**
`killSignal` / `signal`: case-insensitive signal name, uppercased.
*/
export const parseKillSignal: KeyParser = (value) => {
  const s = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return s && SIGNAL_NAMES.has(s) ? { ok: true, set: { killSignal: s } } : { ok: false };
};

/**
`killTimeout`: force-kill escalation window in ms.
*/
export const parseKillTimeout: KeyParser = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? { ok: true, set: { killTimeout: n } } : { ok: false };
};

/**
`env`: string/number/boolean map — every value is stringified before it
reaches the child process environment.
*/
export const parseEnvironment: KeyParser = (value) => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    )
  ) {
    return {
      ok: true,
      set: {
        env: Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)])
        )
      }
    };
  }
  return { ok: false };
};

/**
Nodemon-compatible short alias for `parseEnvironment`.
*/
export const parseEnv = parseEnvironment;

/**
`exec`: non-empty command string, trimmed.
*/
export const parseExec: KeyParser = (value) => {
  return typeof value === 'string' && value.trim()
    ? { ok: true, set: { exec: value.trim() } }
    : { ok: false };
};

/**
`nodeArgs`: array of strings/numbers for node itself.
*/
export const parseNodeArguments: KeyParser = (value) => {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')
    ? { ok: true, set: { nodeArgs: value.map(String) } }
    : { ok: false };
};

/**
Short alias for `parseNodeArguments`.
*/
export const parseNodeArgs = parseNodeArguments;

/**
`execMap`: extension → runner command (`{ "ts": "tsx" }`). Keys are
normalized here: trimmed, lowercased, leading dot stripped (".ts"/"TS" →
"ts"); values must be non-empty strings and are trimmed.
*/
export const parseExecMap: KeyParser = (value) => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string' && v.trim())
  ) {
    return {
      ok: true,
      set: {
        execMap: Object.fromEntries(
          Object.entries(value as Record<string, string>).map(([k, v]) => [
            k.trim().toLowerCase().replace(/^\./u, ''),
            v.trim()
          ])
        )
      }
    };
  }
  return { ok: false };
};
