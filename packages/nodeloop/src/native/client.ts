/**
Native watcher client — the TypeScript face of the Rust supervisor.

Re-emits every bridged event through a Node EventEmitter with the SAME
names and payload shapes the legacy `Watcher` used
(restart/spawn/spawnError/change/queued/debounced/stopping/exit/crash/
error), so the start command's wiring is a drop-in port of cli.js.
The client holds NO supervision logic of its own — the Rust core is the
single source of lifecycle truth (spec §8/§9).
*/
import { EventEmitter } from 'node:events';
import { DEFAULT_EXTS, DEFAULT_IGNORES } from '../config/defaults.js';
import type { NormalizedConfig } from '../config/schema.js';
import {
  normalizeExtensions,
  normalizeIgnores,
  normalizePollInterval,
  normalizeWatchPaths,
  positive
} from '../runtime/normalize.js';
import { NativeOperationError } from './errors.js';
import type { NativeBinding, NativeEvent, NativeWatchConfig } from './types.js';

export interface NativeWatcherOptions {
  script: string | null | undefined;
  scriptArgs?: string[];
  cwd?: string;
  exec?: string | null | undefined;
  nodeArgs?: string[];
  ext?: string | undefined;
  ignore?: string[];
  watch?: string | string[] | undefined;
  delay?: string | number | undefined;
  maxWait?: string | number | undefined;
  killSignal?: string | undefined;
  killTimeout?: string | number | undefined;
  legacyWatch?: boolean | number | undefined;
  env?: NormalizedConfig['env'];
  /**
  Interactive TTY → child stdin becomes a pipe the client can write into.
  */
  interactiveStdin?: boolean;
}

/**
Display fields the CLI renders — mirrors the legacy Watcher surface.
*/
export interface WatcherDisplayFields {
  watchPaths: string[];
  exts: string[];
  ignoreDisplay: string[];
  delay: number;
  maxWait: number;
  killSignal: string;
  killTimeout: number;
  pollInterval: number;
}

export type WatcherEventMap = {
  change: [payload: { file: string }];
  queued: [payload: { file: string; wait: number }];
  debounced: [];
  restart: [payload: { file: string | null; restarts: number }];
  stopping: [];
  spawn: [payload: { restarts: number }];
  spawnError: [payload: { error: { message: string; code: string | null; path: string | null } }];
  exit: [payload: { code: number | null; signal: string | null }];
  crash: [payload: { code: number | null }];
  error: [payload: Error];
};

// EventEmitter is part of the public NativeWatcher contract.
export class NativeWatcher extends EventEmitter {
  private readonly binding: NativeBinding;
  private readonly config: NativeWatchConfig;
  private id: number | undefined;
  private childAlive = false;

  readonly watchPaths: string[];
  readonly exts: string[];
  readonly ignoreDisplay: string[];
  readonly delay: number;
  readonly maxWait: number;
  readonly killSignal: string;
  readonly killTimeout: number;
  readonly pollInterval: number;
  /**
  The file the next restart blames (nulled for manual restarts).
  */
  lastChange: string | null | undefined = null;
  stopped = false;

  constructor(binding: NativeBinding, options: NativeWatcherOptions) {
    super();
    this.binding = binding;
    const cwd = options.cwd ?? process.cwd();
    const ignores = normalizeIgnores([...(options.ignore ?? []), ...DEFAULT_IGNORES]);
    this.watchPaths = normalizeWatchPaths(options.watch, cwd);
    this.exts = normalizeExtensions(options.ext ?? DEFAULT_EXTS);
    this.ignoreDisplay = ignores.display;
    this.delay = positive(options.delay, 200);
    this.maxWait = positive(options.maxWait, 0);
    this.killSignal = options.killSignal ?? 'SIGTERM';
    this.killTimeout = positive(options.killTimeout, 3000);
    this.pollInterval = normalizePollInterval(options.legacyWatch);

    this.config = {
      script: options.script ?? null,
      scriptArgs: options.scriptArgs ?? [],
      cwd,
      exec: options.exec ?? null,
      nodeArgs: (options.nodeArgs ?? []).map(String),
      ext: this.exts.length > 0 ? this.exts.join(',') : null,
      ignore: [...ignores.set],
      watch: this.watchPaths,
      delay: this.delay,
      maxWait: this.maxWait,
      killSignal: this.killSignal,
      killTimeout: this.killTimeout,
      pollInterval: this.pollInterval,
      env: options.env ?? {},
      stdio: options.interactiveStdin ? 'interactive' : 'inherit'
    };
  }

  private handleEvent(json: string): void {
    let event: NativeEvent;
    try {
      event = JSON.parse(json) as NativeEvent;
    } catch {
      this.emit('error', new Error(`unparsable native event: ${json}`));
      return;
    }
    switch (event.type) {
      case 'change': {
        this.lastChange = event.file;
        this.emit('change', { file: event.file });
        break;
      }
      case 'queued': {
        this.emit('queued', { file: event.file, wait: event.wait });
        break;
      }
      case 'debounced': {
        this.emit('debounced');
        break;
      }
      case 'restart': {
        this.emit('restart', { file: event.file, restarts: event.restarts });
        break;
      }
      case 'stopping': {
        this.emit('stopping');
        break;
      }
      case 'spawn': {
        this.childAlive = true;
        this.emit('spawn', { restarts: event.restarts });
        break;
      }
      case 'spawnError': {
        this.childAlive = false;
        this.emit('spawnError', {
          error: { message: event.message, code: event.code, path: event.path }
        });
        break;
      }
      case 'exit': {
        this.childAlive = false;
        this.emit('exit', { code: event.code, signal: event.signal });
        break;
      }
      case 'crash': {
        this.emit('crash', { code: event.code });
        break;
      }
      case 'error': {
        this.emit('error', new Error(event.message));
        break;
      }
    }
  }

  /**
  Serialize the display fields the CLI needs (exported for tests).
  */
  display(): WatcherDisplayFields {
    return {
      watchPaths: this.watchPaths,
      exts: this.exts,
      ignoreDisplay: this.ignoreDisplay,
      delay: this.delay,
      maxWait: this.maxWait,
      killSignal: this.killSignal,
      killTimeout: this.killTimeout,
      pollInterval: this.pollInterval
    };
  }

  /**
  Start watching + spawn the child.
  */
  start(): this {
    this.stopped = false;
    this.id = this.binding.watcherStart(JSON.stringify(this.config), (error, json) => {
      if (error) {
        /* c8 ignore start — defensive: native binding always passes Error or string */
        let message = 'native watcher error';
        if (error instanceof Error) {
          message = error.message;
        } else if (typeof error === 'string') {
          message = error;
        } else if (
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ) {
          message = error.message;
        }
        /* c8 ignore end */
        this.emit('error', error instanceof Error ? error : new Error(message, { cause: error }));
        return;
      }
      this.handleEvent(json);
    });
    this.childAlive = this.binding.watcherChildAlive(this.id);
    return this;
  }

  /**
  Stop watching and kill the child. No further restarts.
  */
  stop(): void {
    if (this.id !== undefined && !this.stopped) {
      // drops the registry entry — any later native op on this id is "not running"
      this.binding.watcherStop(this.id);
    }
    this.childAlive = false;
    this.stopped = true;
  }

  /**
  Kill the running child and start it again (restart accounting natively).
  */
  restart(): void {
    if (this.stopped || this.id === undefined) {
      return;
    }
    this.binding.watcherRestart(this.id);
  }

  /**
  Forward a chunk to the child's stdin (interactive mode).
  */
  writeStdin(data: string): boolean {
    return (
      this.id !== undefined &&
      !this.stopped &&
      this.binding.watcherWriteStdin(this.id, Buffer.from(data, 'utf8'))
    );
  }

  /**
  Whether the supervised child is alive right now.
  */
  hasLiveChild(): boolean {
    if (this.id !== undefined && !this.stopped) {
      this.childAlive = this.binding.watcherChildAlive(this.id);
    }
    return this.childAlive;
  }

  /**
  Resolves when the child exits; immediate when none is running.
  */
  onChildExit(): Promise<void> {
    if (!this.hasLiveChild()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const onExit = (): void => {
        this.removeListener('exit', onExit);
        resolve();
      };
      this.on('exit', onExit);
    });
  }

  /**
  Require the native id — throws the predictable operation error otherwise.
  */
  requireId(): number {
    if (this.id === undefined) {
      throw new NativeOperationError('operation', 'watcher was never started');
    }
    return this.id;
  }
}
