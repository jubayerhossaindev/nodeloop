/**
Terminal UI — the full `createUI` port: every lifecycle message builder
with the EXACT legacy strings, the spawn-error humanizer, and the
complete `--help` screen. Builders return STRINGS; callers own the
stream. Honest by design: with colors/glyphs off the output is still
readable, icons never carry meaning alone.
*/

import { MESSAGES } from '../errors/messages.js';
import type { DetectEnvironment, DetectableStream } from './detection.js';
import { detectColorLevel, isDetectUnicode } from './detection.js';
import { BRAND, createStyles, hhmmss, type StyledUI } from './renderer.js';

export interface CreateUIOptions {
  /**
  Stream whose TTY state drives detection (default process.stdout).
  */
  stream?: DetectableStream;
  /**
  true → auto level (min 1), false → off, 1|2|3 → that level, undefined → auto.
  */
  color?: boolean | number | undefined;
  /**
  Force glyphs (undefined = detect).
  */
  unicode?: boolean;
  /**
  Environment override for deterministic tests.
  */
  env?: DetectEnvironment;
  /**
  Platform override for deterministic tests.
  */
  platform?: string;
}

export interface UI extends StyledUI {
  banner(version: string): string;
  rsHint(word: string): string;
  watchingPaths(paths: string): string;
  watchingExts(extensions: string): string;
  starting(command: string): string;
  restarting(options?: { manual?: boolean }): string;
  cleanExit(): string;
  crash(options?: { code?: number | null }): string;
  humanizeSpawnError(error: unknown): string;
  startFailed(options?: { error?: unknown; watching?: boolean }): string;
  invalidConfig(detail: string): string;
  watchError(message: string): string;
  warn(message: string): string;
  fatal(message: string): string;
  hint(message: string): string;
  stopping(): string;
  terminating(): string;
  stopped(): string;
  verbose(message: string, now?: Date): string;
  info(message: string): string;
  help(version: string): string;
}

/**
Build the terminal UI toolkit for the given stream/capabilities.
*/
export function createUI(options: CreateUIOptions = {}): UI {
  const stream = options.stream === undefined ? process.stdout : options.stream;
  const environment = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  let level = detectColorLevel(stream, environment, platform);
  if (options.color === false) {
    level = 0;
  } else if (typeof options.color === 'number') {
    level = Math.min(3, Math.max(1, Math.trunc(options.color)));
  } else if (options.color === true) {
    level ||= 1;
  }
  const isUseUnicode =
    options.unicode === undefined ? isDetectUnicode(stream, environment) : options.unicode;

  const { ui, line } = createStyles({ level, unicode: isUseUnicode });
  const sym = ui.sym;

  /*
  ----------------------------------------------------------------
  */
  /*
  Lifecycle messages — nodemon-style, one logical line each
  */
  /*
  ----------------------------------------------------------------
  */

  const banner = (version: string): string => line(null, null, MESSAGES.banner(version));

  const rsHint = (word: string): string =>
    line(null, null, MESSAGES.rsHint(ui.amber(`\`${word}\``)));

  const watchingPaths = (paths: string): string =>
    line(null, null, MESSAGES.watchingPaths(ui.purple(paths)));

  const watchingExtensions = (extensions: string): string =>
    line(null, null, MESSAGES.watchingExts(ui.purple(extensions)));

  const starting = (command: string): string =>
    line('play', ui.blue, MESSAGES.starting(ui.blue(`\`${command}\``)));

  const restarting = (options_: { manual?: boolean } = {}): string =>
    line(
      'restart',
      ui.amber,
      ui.amber(options_.manual ? MESSAGES.restartingManually : MESSAGES.restartingDueToChanges)
    );

  const cleanExit = (): string =>
    line('ok', ui.green, ui.green(`clean exit ${sym.dash} waiting for changes before restart`));

  const crash = (options_: { code?: number | null } = {}): string => {
    const { code = null } = options_;
    const [first, second, third] = MESSAGES.crashLines(code);
    return [
      line('fail', ui.red, ui.red(first)),
      line('watch', ui.brand_, second),
      line(null, null, ui.gray(third))
    ].join('\n');
  };

  const humanizeSpawnError = (error: unknown): string => {
    const error_ =
      typeof error === 'object' && error !== null
        ? (error as { message?: unknown; code?: unknown; path?: unknown })
        : undefined;
    let message = '';
    if (typeof error === 'string') {
      message = error;
    } else if (typeof error_?.message === 'string') {
      message = error_.message;
    }
    const code = typeof error_?.code === 'string' ? error_.code : undefined;
    const errorPath = typeof error_?.path === 'string' ? error_.path : undefined;
    const m = /spawn(?:Sync)?\s+(.+?)\s+ENOENT$/u.exec(message);
    if (code === 'ENOENT' || message.endsWith('ENOENT')) {
      return MESSAGES.executableNotFound(m?.[1] ?? errorPath ?? message.replace(/\s*ENOENT$/u, ''));
    }
    if (code === 'EACCES' || /\sEACCES$/u.test(message)) {
      return MESSAGES.permissionDenied(
        errorPath ?? message.replace(/\s*EACCES$/u, '').replace(/^spawn(?:Sync)?\s+/u, '')
      );
    }
    return message;
  };

  const startFailed = (options_: { error?: unknown; watching?: boolean } = {}): string => {
    const lines = [
      line('fail', ui.red, ui.red(MESSAGES.failedToStart)),
      ui.red(humanizeSpawnError(options_.error)),
      line(null, null, ui.gray(MESSAGES.checkExecutableConfig))
    ];
    if (options_.watching ?? true) {
      lines.push(line('watch', ui.brand_, MESSAGES.watcherStillActive));
    }
    return lines.join('\n');
  };

  const invalidConfig = (detail: string): string =>
    [
      line('fail', ui.red, ui.red(MESSAGES.invalidConfiguration)),
      ui.red(detail),
      line(null, null, ui.gray(MESSAGES.checkConfiguration))
    ].join('\n');

  const watchError = (message: string): string => {
    const lines = [line('fail', ui.red, ui.red(`watcher error: ${message}`))];
    if (/ENOSPC|inotify/iu.test(message)) {
      lines.push(
        line(
          null,
          null,
          ui.gray('raise the inotify limit with: sudo sysctl fs.inotify.max_user_watches=524288')
        )
      );
    } else if (/EMFILE|too many open files/iu.test(message)) {
      lines.push(
        line(null, null, ui.gray('too many open files — raise the limit with: ulimit -n 4096'))
      );
    }
    return lines.join('\n');
  };

  const warn = (message: string): string =>
    line('warn', ui.amber, `${ui.amber('warning:')} ${message}`);
  const fatal = (message: string): string => line('fail', ui.red, ui.red(message));
  const hint = (message: string): string => line(null, null, ui.gray(message));
  const stopping = (): string => line('stop', ui.slate, ui.slate(MESSAGES.stopping));
  const terminating = (): string => line(null, null, ui.slate(MESSAGES.terminatingChild));
  const stopped = (): string => line('ok', ui.green, ui.green(MESSAGES.stopped));
  const verbose = (message: string, now?: Date): string =>
    line(null, null, ui.gray(`${hhmmss(now)} ${message}`));
  const info = (message: string): string => line(null, null, ui.gray(message));

  /*
  ----------------------------------------------------------------
  */
  /*
  --help — modern aligned layout, pure runner (unchanged copy)
  */
  /*
  ----------------------------------------------------------------
  */

  const help = (version: string): string => {
    const L: string[] = [
      `  ${ui.cyan(sym.watch)} ${ui.cyan(ui.bold(BRAND))} ${ui.dim(`v${version}`)} ${ui.dim(`${sym.dash} pure nodemon-style auto-restart runner`)}`
    ];

    /*
    masthead
    */

    /*
    bold uppercase section header with optional dim subtitle
    */
    const section = (name: string, subtitle?: string): void => {
      L.push(
        '',
        `  ${ui.cyan(ui.bold(name))}${subtitle ? ` ${ui.dim(`${sym.dash} ${subtitle}`)}` : ''}`
      );
    };

    /*
    USAGE
    */
    section('USAGE');
    L.push(`    ${ui.cyan(ui.bold(BRAND))} ${ui.magenta('[options] [script.js] [args]')}`);

    /* OPTIONS — padding is computed on the PLAIN text so colored and piped
       renders align identically */
    section('OPTIONS');
    const rows: Array<[string, string, string, string]> = [
      ['-e, --ext', '<list>', 'Extensions to look for, ie. js,mjs,cjs,json', ''],
      ['-i, --ignore', '<dirs>', 'Ignore specific dir names, ie. uploads,logs', ''],
      ['-w, --watch', '<dirs>', 'Only restart for changes under these paths', ''],
      ['-d, --delay', '<ms>', 'Restart debounce', 'default: 200'],
      [
        '-m, --max-wait',
        '<ms>',
        'Force a restart during endless change bursts',
        'default: 0 = off'
      ],
      ['-x, --exec', '<cmd>', 'Execute script with "cmd", ie. tsx or "npm run dev"', ''],
      ['--node-args', '<args>', 'Extra args for node itself, ie. "--inspect"', ''],
      ['--config', '<file>', 'Use this config file', 'default: auto-detected'],
      ['-v, -V, --verbose', '', 'Show detail on what is causing restarts', ''],
      ['-q, --quiet', '', `Only your app output ${sym.dash} banners off`, ''],
      ['--color', '', 'Force colors on', 'default: auto-detect'],
      ['--no-color', '', 'Force colors off', ''],
      ['-h, --help', '', 'The page you are looking at now', ''],
      ['--version', '', 'Print nodeloop version', '']
    ];
    const GAP = 3;
    const descCol = Math.max(...rows.map(([f, t]) => f.length + (t ? t.length + 1 : 0))) + GAP;
    for (const [flags, type, desc, defer] of rows) {
      const leftPlain = flags + (type ? ` ${type}` : '');
      const left =
        flags
          .split(',')
          .map((a) => ui.cyan(a))
          .join(ui.dim(',')) + (type ? ` ${ui.magenta(type)}` : '');
      L.push(
        `    ${left}${' '.repeat(descCol - leftPlain.length)}${desc}${defer ? ui.dim(` (${defer})`) : ''}`
      );
    }

    /*
    SCRIPT & ARGS
    */
    section('SCRIPT & ARGS');
    L.push(
      `    No script? "main" from package.json, then index.js, then server.js`,
      `    nodeloop never invents commands from package.json "scripts" ${sym.dash} to run a`,
      `    dev server (Vite etc.), set ${ui.cyan('"exec"')} in the config, e.g. ${ui.cyan('"npm run dev"')}`,
      '    without a config file it watches .js, .mjs, .cjs and .json by default',
      `    runner flags must come ${ui.bold('BEFORE')} the script ${sym.dash} everything after the script`,
      `    goes to your app verbatim. A ${ui.cyan('"--"')} separator (nodemon-style) forces the split:`,
      `      nodeloop app.js -- --config      ${ui.dim('# passes --config to app.js')}`
    );

    /*
    CONFIG FILE
    */
    section('CONFIG FILE', 'auto-detected in cwd, first match wins');
    const tip = ` ${ui.gray(sym.tip)} `;
    L.push(
      `    ${['nodeloop.json', '.nodelooprc', 'nodeloop.toml', 'nodeloop.yaml', 'nodeloop.yml'].map((n) => ui.green(n)).join(tip)}`,
      `    ${ui.gray(sym.tip)} ${['nodeloop.js', 'nodeloop.mjs', 'nodeloop.ts', 'nodeloop.mts', 'package.json "nodeloop" key'].map((n) => ui.green(n)).join(tip)}`,
      `    ${ui.dim('keys: script, scriptArgs (args), ext, ignore, watch, delay, maxWait, verbose,')}`,
      `    ${ui.dim('      quiet, killSignal (signal), killTimeout, env, exec, nodeArgs, execMap,')}`,
      `    ${ui.dim('      restartable, colours, legacyWatch, events')}`,
      `    ${ui.dim(`nodemon-style keys ${sym.dash} restartable, execMap, events, colours, signal,`)}`,
      `    ${ui.dim(`legacyWatch, args ${sym.dash} are first-class here, no unknown-key warnings`)}`,
      `    ${ui.dim('CLI flags always override the config file')}`
    );

    /*
    INTERACTIVE
    */
    section('INTERACTIVE');
    L.push(
      `    ${ui.dim('type')} ${ui.cyan(ui.bold('rs'))} ${ui.dim('+ Enter to force a restart (interactive TTY only)')}`,
      `    ${ui.dim('rename the word with config "restartable", or set "restartable": false')}`,
      `    ${ui.dim('to hand the terminal straight to your app')}`
    );

    /*
    EXAMPLES — trailing comments share one column
    */
    section('EXAMPLES');
    const examples: Array<[string, string]> = [
      ['nodeloop server.js', ''],
      ['nodeloop -e js,json app.js --port 3000', '--port goes to app.js'],
      ['nodeloop -i uploads,logs server.js', ''],
      ['nodeloop -w packages/api server.js', 'monorepo scope'],
      ['nodeloop -x tsx src/main.ts', 'run TS without node'],
      ['nodeloop --config nodeloop.toml app.js', ''],
      ['nodeloop -q server.js', 'banners off (scripts/CI)'],
      ['nodeloop app.js -- --config', 'after -- goes to app.js']
    ];
    const commandW = Math.max(...examples.map(([c]) => c.length));
    for (const [command, comment] of examples) {
      /*
      every documented example is prefixed "nodeloop " — bold just the brand
      */
      const brand = ui.bold('nodeloop') + command.slice('nodeloop'.length);
      const lineString = `    ${ui.green('$')} ${brand}`;
      L.push(
        comment
          ? `${lineString}${' '.repeat(commandW - command.length + 2)}${ui.dim(`# ${comment}`)}`
          : lineString
      );
    }

    /*
    footer — bookend glyph
    */
    L.push(
      '',
      `  ${ui.cyan(sym.watch)} ${ui.dim(`zero dependencies ${sym.mid} MIT ${sym.mid} node >= 20`)}`
    );
    return L.join('\n');
  };

  return {
    ...ui,
    banner,
    rsHint,
    watchingPaths,
    watchingExts: watchingExtensions,
    starting,
    restarting,
    cleanExit,
    crash,
    humanizeSpawnError,
    startFailed,
    invalidConfig,
    watchError,
    warn,
    fatal,
    hint,
    stopping,
    terminating,
    stopped,
    verbose,
    info,
    help
  };
}

export { type ColorWrap } from './colors.js';
