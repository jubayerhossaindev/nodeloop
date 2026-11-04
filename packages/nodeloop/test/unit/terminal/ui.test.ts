import { describe, expect, it } from 'vitest';
import { createUI } from '../../../src/terminal/ui.js';
import { stripAnsi } from '../../../src/terminal/colors.js';
import { BRAND, hhmmss } from '../../../src/terminal/renderer.js';

const plain = createUI({ color: false, unicode: false, env: {}, stream: {} });
const unicodeUI = createUI({ color: false, unicode: true, env: {}, stream: {} });
const colorUI = createUI({ color: 3, unicode: true, env: {}, stream: { isTTY: true } });

const textOf = (s: string): string => stripAnsi(s);
const linesOf = (s: string): string[] => stripAnsi(s).split('\n');

describe('createUI — banner', () => {
  it("renders '[nodeloop] <version>' as plain text", () => {
    expect(textOf(plain.banner('1.0.0'))).toBe('[nodeloop] 1.0.0');
  });

  it('with color off the banner is the PLAIN string — zero SGR codes (regression: --no-color purity)', () => {
    expect(plain.banner('1.0.0')).toBe('[nodeloop] 1.0.0');
    // the entire help screen at color:false must not contain a single escape
    expect(plain.help('1.0.0').includes(String.fromCodePoint(0x1b))).toBe(false);
    expect(plain.crash({ code: 1 }).includes(String.fromCodePoint(0x1b))).toBe(false);
  });

  it('with truecolor the banner is ESC-prefixed and strips back to plain text', () => {
    const banner = colorUI.banner('1.0.0');
    expect(banner.startsWith('\u{1B}[')).toBe(true);
    expect(banner).toBe('\u{1B}[38;2;66;217;243m[nodeloop]\u{1B}[39m 1.0.0');
    expect(stripAnsi(banner)).toBe('[nodeloop] 1.0.0');
  });
});

describe('createUI — watch info lines', () => {
  it('rsHint mentions the restart word with SINGLE backticks (legacy parity — no doubling)', () => {
    expect(textOf(plain.rsHint('rs'))).toBe('[nodeloop] to restart at any time, enter `rs`');
  });

  it('watchingPaths renders the path list', () => {
    expect(textOf(plain.watchingPaths('src, lib'))).toBe('[nodeloop] watching path(s): src, lib');
  });

  it('watchingExts renders the extension list', () => {
    expect(textOf(plain.watchingExts('js,mjs,cjs,json'))).toBe(
      '[nodeloop] watching extensions: js,mjs,cjs,json'
    );
  });
});

describe('createUI — start/stop lifecycle', () => {
  it("starting shows '>' with unicode off and the command in backticks", () => {
    const text = textOf(plain.starting('node app.js'));
    expect(text).toBe('[nodeloop] > starting `node app.js`');
    expect(text).toContain('>');
    expect(text).toContain('`node app.js`');
    expect(text).not.toContain('▶');
  });

  it("starting shows '▶' with unicode on", () => {
    const text = textOf(unicodeUI.starting('node app.js'));
    expect(text).toBe('[nodeloop] ▶ starting `node app.js`');
    expect(text).toContain('▶');
    expect(text).toContain('`node app.js`');
  });

  it('restarting distinguishes manual vs due-to-changes', () => {
    expect(textOf(plain.restarting({ manual: true }))).toContain('restarting manually...');
    expect(textOf(plain.restarting())).toContain('restarting due to changes...');
    expect(textOf(plain.restarting())).not.toContain('manually');
  });

  it('cleanExit uses the ASCII dash with unicode off', () => {
    expect(textOf(plain.cleanExit())).toBe(
      '[nodeloop] + clean exit - waiting for changes before restart'
    );
  });

  it('cleanExit uses the em dash glyph with unicode on', () => {
    expect(textOf(unicodeUI.cleanExit())).toBe(
      '[nodeloop] ✓ clean exit — waiting for changes before restart'
    );
  });

  it('stopping / terminating / stopped use the exact texts', () => {
    expect(textOf(plain.stopping())).toBe('[nodeloop] - stopping...');
    expect(textOf(plain.terminating())).toBe('[nodeloop] terminating child process');
    expect(textOf(plain.stopped())).toBe('[nodeloop] + nodeloop stopped');
  });
});

describe('createUI — failure reporting', () => {
  it('crash({code:1}) is a 3-line block with the exact texts', () => {
    const lines = plain.crash({ code: 1 }).split('\n');
    expect(lines).toHaveLength(3);
    expect(linesOf(plain.crash({ code: 1 }))).toEqual([
      '[nodeloop] x app crashed — exit code 1',
      '[nodeloop] o watching for changes',
      '[nodeloop] fix the error and save a file to retry'
    ]);
  });

  it('startFailed humanizes ENOENT and keeps the watcher line while watching', () => {
    const out = plain.startFailed({
      error: { message: 'spawn tsx ENOENT', code: 'ENOENT' },
      watching: true
    });
    const text = textOf(out);
    expect(text).toContain('failed to start');
    expect(text).toContain('Executable not found: tsx');
    expect(text).toContain('check your executable or command configuration');
    expect(text).toContain('watcher still active');
    expect(linesOf(out)).toEqual([
      '[nodeloop] x failed to start',
      'Executable not found: tsx',
      '[nodeloop] check your executable or command configuration',
      '[nodeloop] o watcher still active'
    ]);
  });

  it('startFailed omits the watcher line when watching:false', () => {
    const out = plain.startFailed({
      error: { message: 'spawn tsx ENOENT', code: 'ENOENT' },
      watching: false
    });
    expect(out).not.toContain('watcher still active');
    expect(linesOf(out)).toEqual([
      '[nodeloop] x failed to start',
      'Executable not found: tsx',
      '[nodeloop] check your executable or command configuration'
    ]);
  });

  it('humanizeSpawnError maps EACCES to "Permission denied:"', () => {
    expect(plain.humanizeSpawnError({ message: 'spawn /root/app EACCES', code: 'EACCES' })).toBe(
      'Permission denied: /root/app'
    );
  });

  it('humanizeSpawnError passes unknown errors through', () => {
    expect(plain.humanizeSpawnError({ message: 'boom' })).toBe('boom');
    expect(plain.humanizeSpawnError('weird failure')).toBe('weird failure');
  });

  it('invalidConfig is a 3-line block with the detail in the middle', () => {
    const out = plain.invalidConfig('bad key "delai"');
    expect(linesOf(out)).toEqual([
      '[nodeloop] x invalid configuration',
      'bad key "delai"',
      '[nodeloop] check the configuration and run again'
    ]);
  });

  it('watchError adds the ENOSPC inotify hint', () => {
    const lines = linesOf(plain.watchError('ENOSPC: no space left on device, watching'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('watcher error: ENOSPC: no space left on device, watching');
    expect(lines[1]).toBe(
      '[nodeloop] raise the inotify limit with: sudo sysctl fs.inotify.max_user_watches=524288'
    );
  });

  it('watchError adds the EMFILE ulimit hint', () => {
    const lines = linesOf(plain.watchError('EMFILE: too many open files'));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('[nodeloop] too many open files — raise the limit with: ulimit -n 4096');
  });

  it('watchError stays a single line (fail glyph included) for unrelated errors', () => {
    const lines = linesOf(plain.watchError('something else broke'));
    expect(lines).toEqual(['[nodeloop] x watcher error: something else broke']);
  });
});

describe('createUI — warn/fatal/hint and diagnostics', () => {
  it('warn prefixes "warning:" with the warn glyph', () => {
    expect(textOf(plain.warn('watch dir missing'))).toBe('[nodeloop] ! warning: watch dir missing');
  });

  it('fatal renders with the fail glyph', () => {
    expect(textOf(plain.fatal('config unreadable'))).toBe('[nodeloop] x config unreadable');
  });

  it('hint renders plain gray text with the prefix', () => {
    expect(textOf(plain.hint('tip here'))).toBe('[nodeloop] tip here');
  });

  it('verbose includes an HH:MM:SS timestamp', () => {
    const out = plain.verbose('child process spawned', new Date(2024, 0, 1, 3, 5, 9));
    expect(textOf(out)).toBe('[nodeloop] 03:05:09 child process spawned');
    expect(plain.verbose('file change detected: app.js')).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(textOf(plain.verbose('file change detected: app.js'))).toContain(
      'file change detected: app.js'
    );
  });

  it('info renders the message with the prefix', () => {
    expect(textOf(plain.info('watching 12 files'))).toBe('[nodeloop] watching 12 files');
  });
});

describe('createUI — help', () => {
  it('contains USAGE, OPTIONS, every option row, SCRIPT & ARGS, CONFIG FILE, INTERACTIVE, EXAMPLES', () => {
    const text = textOf(plain.help('1.0.0'));
    for (const fragment of [
      'USAGE',
      'OPTIONS',
      '-e, --ext',
      '-i, --ignore',
      '-w, --watch',
      '-d, --delay',
      '-m, --max-wait',
      '-x, --exec',
      '--node-args',
      '--config',
      '-v, -V, --verbose',
      '-q, --quiet',
      '--color',
      '--no-color',
      '-h, --help',
      '--version',
      'SCRIPT & ARGS',
      'never invents commands from package.json',
      'INTERACTIVE',
      'EXAMPLES',
      'zero dependencies'
    ]) {
      expect(text).toContain(fragment);
    }
  });

  it('lists all 10 config file names in order', () => {
    const text = textOf(plain.help('1.0.0'));
    expect(text).toContain(
      'nodeloop.json -> .nodelooprc -> nodeloop.toml -> nodeloop.yaml -> nodeloop.yml'
    );
    expect(text).toContain(
      'nodeloop.js -> nodeloop.mjs -> nodeloop.ts -> nodeloop.mts -> package.json "nodeloop" key'
    );
  });

  it('shows all 8 example commands', () => {
    const text = textOf(plain.help('1.0.0'));
    for (const example of [
      'nodeloop server.js',
      'nodeloop -e js,json app.js --port 3000',
      'nodeloop -i uploads,logs server.js',
      'nodeloop -w packages/api server.js',
      'nodeloop -x tsx src/main.ts',
      'nodeloop --config nodeloop.toml app.js',
      'nodeloop -q server.js',
      'nodeloop app.js -- --config'
    ]) {
      expect(text).toContain(`$ ${example}`);
    }
    expect(text).toContain('# run TS without node');
  });

  it('prints the version in the masthead', () => {
    const text = textOf(plain.help('9.9.9'));
    expect(text).toContain('v9.9.9');
    expect(text).toContain('pure nodemon-style auto-restart runner');
  });
});

describe('renderer helpers', () => {
  it('BRAND is "nodeloop"', () => {
    expect(BRAND).toBe('nodeloop');
  });

  it('hhmmss formats a Date as HH:MM:SS', () => {
    expect(hhmmss(new Date(2024, 0, 1, 3, 5, 9))).toBe('03:05:09');
    expect(hhmmss(new Date(2024, 10, 20, 23, 59, 59))).toBe('23:59:59');
  });

  it('hhmmss(undefined) uses the current time', () => {
    expect(hhmmss(undefined)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
