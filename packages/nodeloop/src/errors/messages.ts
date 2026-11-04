/**
Every nodeloop-owned message in one place — the single source of truth
for the exact strings the legacy CLI prints. The terminal layer styles
them; this module never touches a stream.
*/
export const MESSAGES = {
  banner: String,
  /**
  backticks are added by the styling caller — never doubled here
  */
  rsHint: (word: string) => `to restart at any time, enter ${word}`,
  watchingPaths: (paths: string) => `watching path(s): ${paths}`,
  watchingExts: (extensions: string) => `watching extensions: ${extensions}`,
  starting: (command: string) => `starting ${command}`,
  restartingDueToChanges: 'restarting due to changes...',
  restartingManually: 'restarting manually...',
  cleanExit: 'clean exit — waiting for changes before restart',
  crashLines: (code: number | null = null): [string, string, string] => [
    `app crashed — exit code ${code}`,
    'watching for changes',
    'fix the error and save a file to retry'
  ],
  failedToStart: 'failed to start',
  executableNotFound: (what: string) => `Executable not found: ${what}`,
  permissionDenied: (what: string) => `Permission denied: ${what}`,
  checkExecutableConfig: 'check your executable or command configuration',
  watcherStillActive: 'watcher still active',
  invalidConfiguration: 'invalid configuration',
  checkConfiguration: 'check the configuration and run again',
  stopping: 'stopping...',
  terminatingChild: 'terminating child process',
  stopped: 'nodeloop stopped',
  unknownKeys: (label: string, keys: string[]) =>
    `unknown key(s) in ${label}: ${keys.join(', ')} — ignored`,
  badKeys: (keys: string[]) => `invalid value for key(s): ${keys.join(', ')} — using defaults`,
  noScript: 'no script given and none found',
  scriptNotFound: (script: string) => `script not found: ${script}`,
  lagNotSupported:
    'script not found: lag — nodeloop has no lag monitor (it is a pure nodemon-style auto-restart runner)',
  configNotFound: (file: string) => `config file not found: ${file}`,
  scriptIsDirectory: (script: string) =>
    `script is a directory: ${script} — node found no entry file inside it (needs index.js or package.json)`,
  /**
  verbose diagnostics — the timestamp is prepended by the renderer
  */
  verboseSpawned: 'child process spawned',
  verboseChange: (file: string) => `file change detected: ${file}`,
  verboseQueued: (wait: number) => `restart queued (debounce ${wait}ms)`,
  verboseDebounced: 'debounce completed',
  verboseStopping: 'stopping previous process'
} as const;
