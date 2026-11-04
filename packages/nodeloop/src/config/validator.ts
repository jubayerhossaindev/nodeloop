/**
Configuration sanitizer — validate + coerce a raw config object into
`NormalizedConfig`. A 1:1 port of `lib/config.js sanitize()`:

  • unknown keys → `unknownKeys` (warned, ignored — never a crash);
  • known keys with wrong types → `badKeys` (warned, then defaulted);
  • a non-object root throws.

Key routing (spec §7): execution/watch/restart/process/terminal/events
key families live in their own modules; aliases route through aliases.ts.
*/
import { KNOWN_KEYS, type NormalizedConfig, type RawConfig } from './schema.js';
import { parseScript, parseScriptArguments } from './keys/execution.js';
import { parseExtension, parseIgnore, parseWatch, parseLegacyWatch } from './keys/watch.js';
import { parseDelay, parseMaxWait, parseRestartable } from './keys/restart.js';
import {
  parseKillSignal,
  parseKillTimeout,
  parseEnvironment,
  parseExec,
  parseNodeArguments,
  parseExecMap
} from './keys/process.js';
import { parseVerbose, parseQuiet, parseColours } from './keys/terminal.js';
import { parseEvents } from './keys/events.js';
import type { KeyParser } from './keys/types.js';

/**
key → parser registry. Aliases resolve to their canonical parser.
*/
export const KEY_PARSERS: Readonly<Record<string, KeyParser>> = {
  script: parseScript,
  scriptArgs: parseScriptArguments,
  args: parseScriptArguments,
  ext: parseExtension,
  ignore: parseIgnore,
  watch: parseWatch,
  legacyWatch: parseLegacyWatch,
  delay: parseDelay,
  maxWait: parseMaxWait,
  restartable: parseRestartable,
  killSignal: parseKillSignal,
  signal: parseKillSignal,
  killTimeout: parseKillTimeout,
  env: parseEnvironment,
  exec: parseExec,
  nodeArgs: parseNodeArguments,
  execMap: parseExecMap,
  verbose: parseVerbose,
  quiet: parseQuiet,
  colours: parseColours,
  colors: parseColours,
  events: parseEvents
};

export interface SanitizeResult {
  values: NormalizedConfig;
  unknownKeys: string[];
  badKeys: string[];
}

/**
Validate + coerce the raw object into watcher options.
@param raw parsed configuration object (any shape)
@throws when the root is not a plain object
*/
export function sanitizeConfig(raw: unknown): SanitizeResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('config root must be an object (e.g. { "ext": "js,json" })');
  }
  const values: NormalizedConfig = {};
  const unknownKeys: string[] = [];
  const badKeys: string[] = [];

  for (const [key, value] of Object.entries(raw as RawConfig)) {
    if (!KNOWN_KEYS.has(key)) {
      unknownKeys.push(key);
      continue;
    }
    const parser = KEY_PARSERS[key];
    /* v8 ignore start — registry/KNOWN_KEYS consistency is asserted in
       keys-consistency.test.ts; the guard only survives a future edit. */
    if (!parser) {
      badKeys.push(key);
      continue;
    }
    /* v8 ignore end */
    const result = parser(value);
    if (result.ok) {
      Object.assign(values, result.set);
    } else {
      badKeys.push(key);
    }
  }

  return { values, unknownKeys, badKeys };
}
