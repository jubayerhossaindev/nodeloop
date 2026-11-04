/**
Terminal handoff decision — when nodeloop must NOT intercept stdin.

Interactive mode (pipe child stdin + recognize restart words) requires
ALL of:
  • stdin is a TTY (scripts/CI keep the inherit behavior — zero
    automation changes);
  • NODELOOP_NO_RS ≠ "1" (documented opt-out);
  • config `restartable` is not `false` (hand the terminal to the app).
*/
import type { NormalizedConfig } from '../config/schema.js';
import { DEFAULT_RESTARTABLE } from '../config/defaults.js';

export interface InteractiveStdinOptions {
  isTTY: boolean;
  /**
  process.env (injectable for tests).
  */
  env?: NodeJS.ProcessEnv;
  /**
  sanitized config `restartable` — word, false, or undefined.
  */
  restartable: NormalizedConfig['restartable'];
}

/**
true when stdin forwarding + `rs` recognition should activate.
*/
export function shouldInterceptStdin(options: InteractiveStdinOptions): boolean {
  const environment = options.env ?? process.env;
  return options.isTTY && environment['NODELOOP_NO_RS'] !== '1' && options.restartable !== false;
}

/**
The restart word to recognize: config value, or the built-in "rs".
(`false` never reaches here — shouldInterceptStdin already excluded it.)
*/
export function restartWord(restartable: NormalizedConfig['restartable']): string {
  return restartable === false ? DEFAULT_RESTARTABLE : (restartable ?? DEFAULT_RESTARTABLE);
}
