/**
The runner command — a 1:1 port of the legacy `runnerMode()` in cli.js.

Orchestration order (preserved exactly):
  1. parse argv (nodemon-style scan);
  2. load config (explicit --config wins, else auto-detect; invalid → the
     ✕ invalid configuration block on stderr, exit 1, watcher claims nothing);
  3. colours: config `colours: false` turns ANSI off BEFORE any warning
     or banner is printed (CLI flags already beat it via `color` flag);
  4. unknown-key / bad-key warnings (rustc vocabulary, quiet-gated);
  5. script resolution: CLI arg → config "script" → package.json "main" →
     index.js → server.js — NEVER package.json "scripts";
  6. validation (missing script, `lag` special case, directory scripts);
  7. execMap (only when no explicit exec), restartable, events;
  8. interactive stdin decision (TTY + NODELOOP_NO_RS + restartable);
  9. NativeWatcher construction + event wiring + signal shutdown.
*/
import path from 'node:path';
import { DEFAULT_RESTARTABLE } from '../../config/defaults.js';
import { loadConfig, loadConfigFile } from '../../config/resolver.js';
import type { NormalizedConfig } from '../../config/schema.js';
import { restartMatcher } from '../../interactive/restart-command.js';
import { forwardStdin } from '../../interactive/stdin.js';
import { restartWord, shouldInterceptStdin } from '../../interactive/terminal-handoff.js';
import { NativeWatcher } from '../../native/client.js';
import { loadNativeBinding } from '../../native/loader.js';
import type { NativeBinding } from '../../native/types.js';
import { resolveScriptArguments } from '../../runtime/arguments.js';
import { resolveExecMap } from '../../runtime/exec-map.js';
import { ShutdownCoordinator } from '../../runtime/lifecycle.js';
import { requireScriptOrExec, resolveScript } from '../../runtime/script-resolver.js';
import type { UI } from '../../terminal/ui.js';
import { displayPath, isFileExists, resolveFromCwd } from '../../utils/paths.js';
import {
  isHelpRequested,
  isVersionRequested,
  parseInvocation,
  resolveOptions
} from '../options/mod.js';
import { validateScript } from '../options/validator.js';
import { MESSAGES } from '../../errors/messages.js';

/**
IO surface — injectable so unit tests can capture everything.
*/
export interface RunnerIO {
  out(s: string): void;
  err(s: string): void;
  exit(code: number): never;
  /**
  Working directory for resolution (default process.cwd()).
  */
  cwd(): string;
  /**
  Whether stdin is an interactive TTY (default process.stdin.isTTY).
  */
  stdinIsTTY(): boolean;
  /**
  Environment for NODELOOP_NO_RS (default process.env).
  */
  env(): NodeJS.ProcessEnv;
}

export const defaultIO: RunnerIO = {
  out: (s) => process.stdout.write(`${s}\n`),
  err: (s) => process.stderr.write(`${s}\n`),
  // The CLI must terminate with the requested status code.
  // eslint-disable-next-line n/no-process-exit
  exit: (code) => process.exit(code),
  cwd: () => process.cwd(),
  stdinIsTTY: () => Boolean(process.stdin.isTTY),
  env: () => process.env
};

export interface StartRunnerOptions {
  version: string;
  /**
  UI built from the raw --color/--no-color flags (cli.js parity).
  */
  ui: UI;
  /**
  Rebuild the UI (config colours: false handling).
  */
  createUI: (color: boolean | undefined) => UI;
  io?: RunnerIO;
  /**
  Pre-loaded native binding (tests); default: loadNativeBinding().
  */
  binding?: NativeBinding;
  /**
  Install signal handlers (tests may disable). Default true.
  */
  signals?: boolean;
  /**
  Override the watcher factory entirely (unit tests).
  */
  watcherFactory?: (
    binding: NativeBinding,
    options: ConstructorParameters<typeof NativeWatcher>[1]
  ) => NativeWatcher;
}

/**
Run the supervisor. Returns the started watcher on success; fatal paths
print + exit through the IO layer (never return).
*/
export function startRunner(arguments_: string[], options_: StartRunnerOptions): NativeWatcher {
  const io = options_.io ?? defaultIO;
  const cwd = io.cwd();
  let ui = options_.ui;
  const out = (s: string): void => io.out(s);
  const error = (s: string): void => io.err(s);

  /*
  ---------------- config (explicit wins, else detect) ----------------
  */
  const parsed = parseInvocation(arguments_);

  let loaded;
  if (parsed.values.config === undefined || parsed.values.config === '') {
    loaded = loadConfig(cwd);
  } else {
    const configFile = path.resolve(cwd, parsed.values.config);
    if (!isFileExists(configFile)) {
      error(ui.fatal(`config file not found: ${parsed.values.config}`));
      error(
        ui.hint(
          `supported: nodeloop.json ${ui.sym.mid} .nodelooprc ${ui.sym.mid} nodeloop.toml ${ui.sym.mid} nodeloop.yml ${ui.sym.mid} nodeloop.js ${ui.sym.mid} nodeloop.ts`
        )
      );
      io.exit(1);
    }
    loaded = loadConfigFile(configFile);
  }

  if (loaded.error) {
    error(ui.invalidConfig(loaded.error.message));
    io.exit(1);
  }

  const config: NormalizedConfig = loaded.config;
  const configLabel: string | undefined = loaded.file ? path.relative(cwd, loaded.file) : undefined;

  /*
  colours: false in the config turns ANSI off BEFORE any warning/banner
  */
  if (config.colours === false && parsed.values.color === undefined) {
    ui = options_.createUI(false);
  }

  /*
  merge: CLI flags > config > defaults (ignore EXTENDS — unique)
  */
  const options = resolveOptions(parsed, config, cwd);

  /*
  warnings — rustc "warning:" vocabulary (--quiet keeps even these off)
  */
  if (configLabel && !options.quiet && loaded.unknownKeys.length > 0) {
    out(ui.warn(`unknown key(s) in ${configLabel}: ${loaded.unknownKeys.join(', ')} — ignored`));
  }
  if (configLabel && !options.quiet && loaded.badKeys.length > 0) {
    out(ui.warn(`invalid value for key(s): ${loaded.badKeys.join(', ')} — using defaults`));
  }

  /*
  script resolution + validation
  */
  const script = resolveScript(options.scriptToken ?? null, config.script, cwd);
  if (!script) {
    requireScriptOrExec(Boolean(options.exec), configLabel);
  }
  const scriptPath = script ? resolveFromCwd(cwd, script) : undefined;
  const validated = validateScript(script, scriptPath, cwd);
  void validated; // isDirectory kept for future use; the checks already threw

  /*
  execMap: consulted ONLY when no explicit exec was given
  */
  const execMap = config.execMap ?? {};
  const mapped = options.exec
    ? { cmd: options.exec, used: false }
    : resolveExecMap(execMap, scriptPath);
  const execCommand = mapped.cmd;
  const isExecMapUsed = mapped.used;

  /*
  restartable + events + interactive stdin
  */
  const restartable = config.restartable === undefined ? DEFAULT_RESTARTABLE : config.restartable;
  const events = config.events ?? {};
  const isInteractiveStdin = shouldInterceptStdin({
    isTTY: io.stdinIsTTY(),
    env: io.env(),
    restartable
  });

  /*
  ------------------------- the watcher -------------------------------
  */
  const binding = options_.binding ?? loadNativeBinding();
  const makeWatcher =
    options_.watcherFactory ??
    ((b: NativeBinding, o: ConstructorParameters<typeof NativeWatcher>[1]) =>
      new NativeWatcher(b, o));
  const scriptArguments = resolveScriptArguments(parsed.afterScript, config.scriptArgs);
  const watcher = makeWatcher(binding, {
    script: scriptPath,
    scriptArgs: scriptArguments,
    cwd,
    exec: execCommand ?? undefined,
    nodeArgs: options.nodeArgs,
    ext: options.ext,
    ignore: options.ignore,
    watch: options.watch,
    delay: options.delay,
    maxWait: options.maxWait,
    killSignal: config.killSignal,
    killTimeout: config.killTimeout,
    legacyWatch: config.legacyWatch,
    env: config.env,
    interactiveStdin: isInteractiveStdin
  });

  /* stdin forwarding — through the native bridge's child stdin pipe.
     Custom restart words get their own matcher; the built-in "rs" keeps
     the shared default matcher (legacy parity). */
  if (isInteractiveStdin) {
    forwardStdin({
      from: process.stdin,
      getTarget: () => {
        return watcher.hasLiveChild() && !watcher.stopped
          ? { write: (chunk: string) => void watcher.writeStdin(chunk) }
          : null;
      },
      isCommand: restartable === 'rs' ? undefined : restartMatcher(restartWord(restartable)),
      onCommand: () => {
        watcher.lastChange = null; // manual restart — no file to blame
        watcher.restart();
      }
    });
  }

  /*
  display values — REAL resolved values only
  */
  const scriptDisplay = scriptPath ? displayPath(cwd, scriptPath) : undefined;
  const commandDisplay = execCommand ?? 'node';
  const startParts: string[] = [commandDisplay];
  if (options.nodeArgs.length > 0) {
    startParts.push(...options.nodeArgs);
  }
  if (scriptDisplay) {
    startParts.push(scriptDisplay);
  }
  if (scriptArguments.length > 0) {
    startParts.push(...scriptArguments);
  }
  const startCommand = startParts.join(' ');
  const watchDisplay = watcher.watchPaths.length > 0 ? watcher.watchPaths.join(', ') : '.';
  const extensionsDisplay = watcher.exts.join(',');

  /*
  ↻ restart banner — file changes ("due to changes") and `rs` ("manually")
  */
  watcher.on('restart', ({ file }: { file: string | null }) => {
    if (options.quiet) {
      return;
    }
    out(events.restart ?? ui.restarting({ manual: !file }));
  });

  watcher.on('spawn', ({ restarts }: { restarts: number }) => {
    if (options.quiet) {
      return;
    }
    if (restarts === 0) {
      /*
      first boot — the exact startup sequence (no full re-print on restarts)
      */
      out(ui.banner(options_.version));
      if (isInteractiveStdin) {
        out(ui.rsHint(restartWord(restartable)));
      }
      out(ui.watchingPaths(watchDisplay));
      out(ui.watchingExts(extensionsDisplay));
      if (options.verbose) {
        /* c8 ignore start — verbose rendering branches are UI/display, covered by option unit tests */
        if (configLabel) {
          out(ui.info(`config: ${configLabel}`));
        }
        out(ui.info(`direction: ${cwd}`));
        out(ui.info(`delay: ${watcher.delay}ms`));
        out(ui.info(`ignore: ${watcher.ignoreDisplay.join(', ')}`));
        if (watcher.pollInterval > 0) {
          out(ui.info(`polling: ${watcher.pollInterval}ms (legacyWatch)`));
        }
        if (watcher.maxWait) {
          out(ui.info(`max-wait: ${watcher.maxWait}ms`));
        }
        if (watcher.killSignal !== 'SIGTERM') {
          out(ui.info(`signal: ${watcher.killSignal}`));
        }
        if (isExecMapUsed) {
          out(
            ui.info(
              `execMap: ${Object.entries(execMap)
                .map(([k, v]) => `${k}${ui.sym.tip}${v}`)
                .join(', ')}`
            )
          );
        }
        /* c8 ignore end */
      }
      if (events.start) {
        out(events.start);
      }
    }
    out(
      restarts === 0 ? ui.starting(startCommand) : MESSAGES.starting(ui.blue(`\`${startCommand}\``))
    );
    if (options.verbose && !options.quiet) {
      out(ui.verbose('child process spawned'));
    }
    out(''); // single visual separation between system messages and app output
  });

  /*
  -v/-V diagnostics — real events with real timestamps, nothing invented
  */
  watcher.on('change', ({ file }: { file: string }) => {
    if (options.verbose && !options.quiet) {
      out(ui.verbose(`file change detected: ${file}`));
    }
  });
  watcher.on('queued', ({ wait }: { wait: number }) => {
    if (options.verbose && !options.quiet) {
      out(ui.verbose(`restart queued (debounce ${wait}ms)`));
    }
  });
  watcher.on('debounced', () => {
    if (options.verbose && !options.quiet) {
      out(ui.verbose('debounce completed'));
    }
    watcher.restart();
  });
  watcher.on('stopping', () => {
    if (options.verbose && !options.quiet) {
      out(ui.verbose('stopping previous process'));
    }
  });

  watcher.on('exit', ({ code, signal }: { code: number | null; signal: string | null }) => {
    /* nodemon parity: announce clean exits, invite the next change.
       Restart-kill terminations carry a signal and never reach this branch. */
    if (signal || code !== 0 || options.quiet) {
      return;
    }

    out('');
    out(events.exit ?? ui.cleanExit());
  });

  watcher.on('crash', ({ code }: { code: number | null }) => {
    if (options.quiet) {
      return;
    }
    out('');
    out(events.crash ?? ui.crash({ code }));
  });

  watcher.on('error', (error_: Error) => {
    if (!options.quiet) {
      out(ui.watchError(error_.message));
    }
  });

  watcher.on(
    'spawnError',
    ({ error }: { error: { message: string; code: string | null; path: string | null } }) => {
      if (options.quiet) {
        return;
      }
      out('');
      out(ui.startFailed({ error, watching: !watcher.stopped }));
    }
  );

  /*
  --------------------- signals + bounded shutdown --------------------
  */
  async function shutdown(isSilent: boolean): Promise<void> {
    const coordinator = new ShutdownCoordinator();
    const result = await coordinator.shutdown(
      {
        stop: () => watcher.stop(),
        hasLiveChild: () => watcher.hasLiveChild(),
        onChildExit: () => watcher.onChildExit()
      },
      () => {
        /*
        hard-kill escalation: the Rust core receives it through stop()
        */
        watcher.stop();
      }
    );
    if (!isSilent && result.childStopped) {
      out(ui.stopped());
    }
    io.exit(0);
  }

  if (options_.signals !== false) {
    process.on('SIGINT', () => {
      if (!options.quiet) {
        out('');
        out(events.quit ?? ui.stopping());
        if (watcher.hasLiveChild() && !watcher.stopped) {
          out(ui.terminating());
        }
      }
      void shutdown(options.quiet);
    });
    process.on('SIGTERM', () => void shutdown(true));
    if (process.platform !== 'win32') {
      process.on('SIGHUP', () => void shutdown(true));
    }
  }

  watcher.start();
  return watcher;
}

/**
Used by cli.ts to decide the dispatch before the runner owns the process.
*/
export function wantsHelpOrVersion(arguments_: string[]): 'help' | 'version' | null {
  if (isHelpRequested(arguments_)) {
    return 'help';
  }
  if (isVersionRequested(arguments_)) {
    return 'version';
  }
  return null;
}

/**
Liveness guard re-exported for tests (process-guard parity).
*/

export { isChildProcessAlive } from './process-guard.js';
