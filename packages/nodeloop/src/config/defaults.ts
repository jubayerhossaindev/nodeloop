/**
Built-in defaults — used ONLY where neither CLI nor config provided a
value (spec: config file is the authority; defaults fill the gaps).
Values identical to `lib/watch.js` / `lib/config.js`.
*/

/**
Watched extensions without a config.
*/
export const DEFAULT_EXTS: readonly string[] = ['js', 'mjs', 'cjs', 'json'];

/**
Directory names always ignored, on top of the user's list.
*/
export const DEFAULT_IGNORES: readonly string[] = [
  'node_modules',
  '.git',
  '.npm',
  'coverage',
  '.DS_Store'
];

/**
Debounce window (ms).
*/
export const DEFAULT_DELAY = 200;

/**
Burst cap (ms) — 0 disables the force restart.
*/
export const DEFAULT_MAX_WAIT = 0;

/**
Signal used to stop the child.
*/
export const DEFAULT_KILL_SIGNAL = 'SIGTERM';

/**
Force-kill (SIGKILL) escalation window (ms).
*/
export const DEFAULT_KILL_TIMEOUT = 3000;

/**
Default manual-restart word.
*/
export const DEFAULT_RESTARTABLE = 'rs';
