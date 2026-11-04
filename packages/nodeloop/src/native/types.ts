/**
Native bridge types — the exact contract between the TypeScript layer and
the `nodeloop-native` N-API addon (crates/nodeloop-native).

Design rules (spec §9): the bridge carries NO business logic; it accepts
a runtime configuration, forwards watcher + process lifecycle events,
converts Rust errors, and shuts down gracefully. Everything here is the
TypeScript-side view of that contract.
*/

/**
Supervisor configuration handed to the native watcher (JSON-serialized).
*/
export interface NativeWatchConfig {
  /**
  Absolute script path, or null for exec-only runs.
  */
  script: string | null;
  scriptArgs: string[];
  cwd: string;
  /**
  Command to run; null → the running node binary.
  */
  exec: string | null;
  nodeArgs: string[];
  /**
  Comma-joined extension list (empty → the Rust default).
  */
  ext: string | null;
  /**
  Directory names to ignore (already includes the defaults).
  */
  ignore: string[];
  /**
  Watch-scope prefixes relative to cwd (empty = cwd root).
  */
  watch: string[];
  delay: number;
  maxWait: number;
  killSignal: string;
  killTimeout: number;
  /**
  0 = fs-event backend; > 0 = polling interval (legacyWatch).
  */
  pollInterval: number;
  /**
  Extra environment merged over the inherited environment.
  */
  env: Record<string, string>;
  /**
  "inherit" → child owns the terminal (default);
  "interactive" → child stdin is a pipe nodeloop writes into.
  */
  stdio: 'inherit' | 'interactive';
}

/**
Event payloads the native supervisor forwards (JSON-serialized).
*/
export type NativeEvent =
  | { type: 'change'; file: string }
  | { type: 'queued'; file: string; wait: number }
  | { type: 'debounced' }
  | { type: 'restart'; file: string | null; restarts: number }
  | { type: 'stopping' }
  | { type: 'spawn'; restarts: number }
  | { type: 'spawnError'; message: string; code: string | null; path: string | null }
  | { type: 'exit'; code: number | null; signal: string | null }
  | { type: 'crash'; code: number | null }
  | { type: 'error'; message: string };

/**
The functions every `nodeloop-native` binary MUST export.
*/
export interface NativeModule {
  coreVersion(): string;
  /**
  Start a supervisor; returns the instance id used by every other call.
  The bridge delivers events with the CalleeHandled N-API strategy —
  the JS callback receives `(null, eventJson)`.
  */
  watcherStart(configJson: string, onEvent: (error: unknown, eventJson: string) => void): number;
  watcherStop(id: number): void;
  /**
  Manual restart (`rs`); the Rust side accounts it as its own restart.
  */
  watcherRestart(id: number): void;
  /**
  Write to the current child's stdin (interactive mode); false = no live child.
  */
  watcherWriteStdin(id: number, data: Buffer): boolean;
  /**
  Whether the supervised child is alive right now.
  */
  watcherChildAlive(id: number): boolean;
  /**
  Pure spawn-spec resolver — the Windows/POSIX matrix, testable from TS.
  */
  resolveSpawn(
    exec: string,
    nodeArguments: string[],
    script: string | null,
    scriptArguments: string[],
    platform: string | null,
    nodePath: string
  ): { file: string; args: string[]; shell: boolean };
}

/**
The exported addon shape (a `.node` module).
*/
export type NativeBinding = NativeModule;
