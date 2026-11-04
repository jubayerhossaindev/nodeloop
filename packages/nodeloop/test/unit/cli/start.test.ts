/**
startRunner — the orchestration command — driven end-to-end in-process
with an injectable IO layer, a recording fake binding and real
NativeWatcher instances. Every branch of the runner is exercised here.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunnerIO } from '../../../src/cli/commands/start.js';
import { startRunner } from '../../../src/cli/commands/start.js';
import { NoScriptError } from '../../../src/errors/types.js';
import { forwardStdin } from '../../../src/interactive/stdin.js';
import { NativeWatcher } from '../../../src/native/client.js';
import type { NativeBinding } from '../../../src/native/types.js';
import { createUI } from '../../../src/terminal/ui.js';

vi.mock('../../../src/interactive/stdin.js', () => ({
  forwardStdin: vi.fn(() => ({ detach: () => {} }))
}));

const ui = createUI({ color: false });

class ExitError extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

interface Rec {
  start: string[];
  stop: number[];
  restart: number[];
  write: Array<{ id: number; data: Buffer }>;
  alive: boolean;
  cb: ((error: unknown, json: string) => void) | null;
}
const rec: Rec = { start: [], stop: [], restart: [], write: [], alive: false, cb: undefined };

function fakeBinding(): NativeBinding {
  return {
    coreVersion: () => '1.0.0',
    watcherStart: (configJson: string, onEvent: (error: unknown, json: string) => void) => {
      rec.start.push(configJson);
      rec.cb = onEvent;
      return 42;
    },
    watcherStop: (id) => void rec.stop.push(id),
    watcherRestart: (id) => void rec.restart.push(id),
    watcherWriteStdin: (id, data) => {
      rec.write.push({ id, data });
      return true;
    },
    watcherChildAlive: () => rec.alive,
    resolveSpawn: () => ({ file: 'node', args: [], shell: false })
  };
}

/**
Keeps hasLiveChild() true even after stop() — drives the 2s cap path.
*/
class StickyWatcher extends NativeWatcher {
  stop(): void {
    this.stopped = true; // intentionally does not clear childAlive
  }
}

interface Context {
  out: string[];
  err: string[];
  exits: number[];
}
interface IOOverrides {
  tty?: boolean;
  env?: NodeJS.ProcessEnv;
  exitThrows?: boolean;
}

function makeIO(cwd: string, over: IOOverrides = {}): { io: RunnerIO; ctx: Context } {
  const context: Context = { out: [], err: [], exits: [] };
  const io: RunnerIO = {
    out: (s) => void context.out.push(s),
    err: (s) => void context.err.push(s),
    exit: (code) => {
      context.exits.push(code);
      if (over.exitThrows) {
        throw new ExitError(code);
      }
    },
    cwd: () => cwd,
    stdinIsTTY: () => over.tty ?? false,
    env: () => over.env ?? {}
  };
  return { io, ctx: context };
}

function emit(w: NativeWatcher, name: string, payload?: unknown): void {
  (w as unknown as { emit(n: string, p?: unknown): boolean }).emit(name, payload);
}

/**
Push a native event through the REAL bridge callback (handleEvent runs).
*/
function native(rec2: Rec, event: Record<string, unknown>): void {
  rec2.cb?.(undefined, JSON.stringify(event));
}

const directories: string[] = [];
function temporaryProject(files: Record<string, string>): string {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-start-'));
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(direction, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  directories.push(direction);
  return direction;
}

/* signal-listener hygiene: startRunner registers process handlers; remove
   exactly the ones a test added so later tests are unaffected. */
const listenersBefore = new Map<NodeJS.Signals, NodeJS.SignalsListener[]>();
function snapshotSignals(): void {
  listenersBefore.clear();
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'] as NodeJS.Signals[]) {
    listenersBefore.set(s, [...process.listeners(s)]);
  }
}
function restoreSignals(): void {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'] as NodeJS.Signals[]) {
    for (const l of process.listeners(s)) {
      if (!listenersBefore.get(s)?.includes(l)) {
        process.removeListener(s, l);
      }
    }
  }
}
const totalSignalListeners = (): number =>
  (['SIGINT', 'SIGTERM', 'SIGHUP'] as NodeJS.Signals[])
    .map((s) => process.listenerCount(s))
    .reduce((a, b) => a + b, 0);

beforeEach(() => {
  snapshotSignals();
  rec.start = [];
  rec.stop = [];
  rec.restart = [];
  rec.write = [];
  rec.alive = false;
  vi.mocked(forwardStdin).mockClear();
});
afterEach(restoreSignals);
afterAll(() => {
  for (const d of directories) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('startRunner: fatal paths', () => {
  it('--config pointing at a missing file renders the fatal + hint and exits 1', () => {
    const direction = temporaryProject({ 'app.js': 'x' });
    const { io, ctx } = makeIO(direction, { exitThrows: true });
    expect(() =>
      startRunner(['--config', 'missing.json'], {
        version: '1.0.0',
        ui,
        createUI: () => ui,
        io,
        binding: fakeBinding()
      })
    ).toThrow(ExitError);
    expect(ctx.exits).toEqual([1]);
    expect(ctx.err.join('')).toContain('config file not found: missing.json');
    expect(ctx.err.join('')).toContain('supported: nodeloop.json');
  });

  it('a detected config that fails to parse renders the invalid-config block, exit 1', () => {
    const direction = temporaryProject({ 'nodeloop.json': '{nope', 'app.js': 'x' });
    const { io, ctx } = makeIO(direction, { exitThrows: true });
    expect(() =>
      startRunner([], { version: '1.0.0', ui, createUI: () => ui, io, binding: fakeBinding() })
    ).toThrow(ExitError);
    expect(ctx.exits).toEqual([1]);
    expect(ctx.err.join('')).toContain('nodeloop.json');
  });

  it('no script anywhere and no exec raises NoScriptError (cli.ts renders it)', () => {
    const direction = temporaryProject({});
    const { io, ctx } = makeIO(direction);
    expect(() =>
      startRunner([], { version: '1.0.0', ui, createUI: () => ui, io, binding: fakeBinding() })
    ).toThrow(NoScriptError);
    expect(ctx.out).toEqual([]);
    expect(ctx.err).toEqual([]);
  });
});

describe('startRunner: startup output', () => {
  it('prints banner, start command with node-args and the blank separator line', () => {
    const direction = temporaryProject({ 'app.js': 'console.log(1)' });
    const { io, ctx } = makeIO(direction);
    // runner flags PRECEDE the script (audit §2) — --node-args is a runner flag here
    const w = startRunner(['--node-args', '--harmony', 'app.js', '--', '--port', '3000'], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(w.requireId()).toBe(42);
    emit(w, 'spawn', { restarts: 0 });
    const text = ctx.out.join('\n');
    expect(text).toContain('[nodeloop]');
    expect(text).toContain('node --harmony app.js');
    expect(text).toContain('js,mjs,cjs,json');
    expect(ctx.out.includes('')).toBe(true);
    const config = JSON.parse(rec.start[0]!) as { scriptArgs: string[] };
    // everything after the script goes to the app verbatim (nodemon parity)
    expect(config.scriptArgs).toEqual(['--port', '3000']);
  });

  it('verbose startup prints config/direction/delay/ignore/polling/max-wait/signal/execMap lines', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({
        script: 'app.py',
        execMap: { '.py': 'python3' },
        verbose: true,
        legacyWatch: 250,
        maxWait: 1000,
        killSignal: 'SIGKILL'
      }),
      'app.py': 'print(1)'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    emit(w, 'spawn', { restarts: 0 });
    const text = ctx.out.join('\n');
    expect(text).toContain('config: nodeloop.json');
    expect(text).toContain('direction: ');
    expect(text).toContain('delay: 200ms');
    expect(text).toContain('ignore: ');
    expect(text).toContain('polling: 250ms (legacyWatch)');
    expect(text).toContain('max-wait: 1000ms');
    expect(text).toContain('signal: SIGKILL');
    expect(text).toContain('execMap: ');
    expect(text).toContain('python3');
    expect(text).toContain('child process spawned');
    expect(text).toContain('python3 app.py');
    w.stop();
  });

  it('events overrides replace the built-in start/restart/crash/exit wording', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({
        script: 'app.js',
        events: {
          start: 'APP STARTED',
          restart: 'RESTARTED NOW',
          crash: 'CRASHED BAD',
          exit: 'EXITED CLEAN'
        }
      }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    emit(w, 'spawn', { restarts: 0 });
    emit(w, 'restart', { file: 'app.js', restarts: 1 });
    emit(w, 'restart', { file: undefined, restarts: 2 });
    emit(w, 'crash', { code: 3 });
    emit(w, 'exit', { code: 0, signal: undefined });
    const text = ctx.out.join('\n');
    expect(text).toContain('APP STARTED');
    expect(text).toContain('RESTARTED NOW');
    expect(text).toContain('CRASHED BAD');
    expect(text).toContain('EXITED CLEAN');
    w.stop();
  });

  it('built-in wording: crash block, spawn-failure block, watch error, no clean-exit noise on signal/1', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    emit(w, 'spawn', { restarts: 0 });
    emit(w, 'exit', { code: 0, signal: undefined });
    emit(w, 'crash', { code: 3 });
    emit(w, 'spawnError', {
      error: { message: 'spawn python3 ENOENT', code: 'ENOENT', path: undefined }
    });
    emit(w, 'error', new Error('watch blew up'));
    const text = ctx.out.join('\n');
    expect(text).toContain('failed to start');
    expect(text).toContain('Executable not found: python3');
    expect(text).toContain('app crashed — exit code 3');
    expect(text).toContain('watcher error: watch blew up');
    expect(ctx.out.filter((l) => l === '').length).toBeGreaterThanOrEqual(2);
    const outputLengthBefore = ctx.out.length;
    emit(w, 'exit', { code: 0, signal: 'SIGTERM' });
    expect(ctx.out.length).toBe(outputLengthBefore);
    emit(w, 'exit', { code: 1, signal: undefined });
    expect(ctx.out.length).toBe(outputLengthBefore);
    w.stop();
  });

  it('verbose change/queued/debounced/stopping diagnostics with real event payloads', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', verbose: true }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    emit(w, 'change', { file: 'app.js' });
    emit(w, 'queued', { file: 'app.js', wait: 200 });
    emit(w, 'debounced');
    emit(w, 'stopping');
    const text = ctx.out.join('\n');
    expect(text).toContain('file change detected: app.js');
    expect(text).toContain('restart queued (debounce 200ms)');
    expect(text).toContain('debounce completed');
    expect(text).toContain('stopping previous process');
    w.stop();
  });

  it('--quiet suppresses every nodeloop-owned line including warnings and verbose', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({
        script: 'app.js',
        quiet: true,
        bogus: 1,
        delay: 'zzz',
        verbose: true
      }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    emit(w, 'spawn', { restarts: 0 });
    emit(w, 'change', { file: 'app.js' });
    emit(w, 'queued', { file: 'app.js', wait: 1 });
    emit(w, 'debounced');
    emit(w, 'stopping');
    emit(w, 'crash', { code: 1 });
    emit(w, 'exit', { code: 0, signal: undefined });
    emit(w, 'spawnError', { error: { message: 'x ENOENT', code: 'ENOENT', path: undefined } });
    emit(w, 'error', new Error('boom'));
    expect(ctx.out).toEqual([]);
    w.stop();
  });
});

describe('startRunner: config interactions', () => {
  it('warns about unknown and bad keys using the relative config label', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', bogus: 1, delay: 'abc' }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    const text = ctx.out.join('\n');
    expect(text).toContain('warning:');
    expect(text).toContain('unknown key(s) in nodeloop.json: bogus — ignored');
    expect(text).toContain('invalid value for key(s): delay — using defaults');
    w.stop();
  });

  it('quiet keeps even the warnings off', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', quiet: true, bogus: 1 }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(ctx.out).toEqual([]);
    w.stop();
  });

  it('config colours:false rebuilds the UI without ANSI before anything prints', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', colours: false }),
      'app.js': 'x'
    });
    const { io } = makeIO(direction);
    const spy = vi.fn(() => createUI({ color: false }));
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: spy,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(spy).toHaveBeenCalledWith(false);
    w.stop();
  });

  it('--color on the CLI beats config colours:false (no rebuild)', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', colours: false }),
      'app.js': 'x'
    });
    const { io } = makeIO(direction);
    const spy = vi.fn(() => createUI({ color: false }));
    const w = startRunner(['--color'], {
      version: '1.0.0',
      ui,
      createUI: spy,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(spy).not.toHaveBeenCalled();
    w.stop();
  });

  it('exec-only runs (config exec, no script) never resolve a script', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ exec: 'npm run dev' })
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    emit(w, 'spawn', { restarts: 0 });
    const text = ctx.out.join('\n');
    expect(text).toContain('npm run dev');
    expect(text).not.toContain('server.js');
    w.stop();
  });

  it('CLI --exec replaces the config execMap; execMap only applies without exec', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.py', execMap: { '.py': 'python3' } }),
      'app.py': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner(['-x', 'python3.12'], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    emit(w, 'spawn', { restarts: 0 });
    expect(ctx.out.join('\n')).toContain('python3.12');
    w.stop();
  });

  it('watch scopes are displayed as resolved', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', watch: ['src', 'lib'] }),
      'app.js': 'x',
      'src/x.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    emit(w, 'spawn', { restarts: 0 });
    const configW = JSON.parse(rec.start[0]!) as { watch: string[] };
    expect(configW.watch).toEqual(['src', 'lib']);
    expect(ctx.out.join('\n')).toContain('watching path(s): src, lib');
    w.stop();
  });
});

describe('startRunner: interactive stdin', () => {
  it('TTY + default restartable forwards stdin with the shared rs matcher', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction, { tty: true });
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(vi.mocked(forwardStdin)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(forwardStdin).mock.calls[0]![0];
    expect(call.isCommand).toBeUndefined(); // restartable true → shared rs matcher
    emit(w, 'spawn', { restarts: 0 });
    expect(ctx.out.join('\n')).toContain('rs');
    // getTarget with no live child → null (input dropped)
    expect(call.getTarget()).toBeNull();
    rec.alive = true;
    const target = call.getTarget();
    expect(target).not.toBeNull();
    target!.write('hello\n');
    expect(rec.write[0]!.data.toString()).toBe('hello\n');
    rec.alive = false;
    w.stop();
  });

  it('a custom restart word gets its own matcher and onCommand restarts manually', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', restartable: 'go' }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction, { tty: true });
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    const call = vi.mocked(forwardStdin).mock.calls[0]![0];
    expect(call.isCommand).toBeTypeOf('function');
    expect(call.isCommand!('go\n')).toBe(true);
    expect(call.isCommand!('nope\n')).toBe(false);
    native(rec, { type: 'change', file: 'app.js' }); // through the real bridge callback
    expect(w.lastChange).toBe('app.js');
    call.onCommand!(); // manual restart → blame nothing, restart natively
    expect(w.lastChange).toBeNull();
    expect(rec.restart).toEqual([42]);
    emit(w, 'restart', { file: undefined, restarts: 1 });
    expect(ctx.out.join('\n')).toContain('manually');
    w.stop();
  });

  it('NODELOOP_NO_RS=1 disables interception entirely', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction, { tty: true, env: { NODELOOP_NO_RS: '1' } });
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(vi.mocked(forwardStdin)).not.toHaveBeenCalled();
    emit(w, 'spawn', { restarts: 0 });
    expect(ctx.out.join('\n')).not.toContain('rs');
    w.stop();
  });

  it('restartable false disables interception even on a TTY', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', restartable: false }),
      'app.js': 'x'
    });
    const { io } = makeIO(direction, { tty: true });
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(vi.mocked(forwardStdin)).not.toHaveBeenCalled();
    w.stop();
  });
});

describe('startRunner: shutdown paths', () => {
  it('SIGINT announces stopping + terminating, then the stopped line, exit 0', async () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      binding: fakeBinding()
    });
    rec.alive = true;
    process.emit('SIGINT');
    emit(w, 'exit', { code: undefined, signal: 'SIGTERM' }); // the coordinator waits for this
    await delay(50);
    const text = ctx.out.join('\n');
    expect(text).toContain('stopping');
    expect(text).toContain('terminating');
    expect(text).toContain('stopped');
    expect(ctx.exits).toEqual([0]);
  });

  it('SIGTERM shuts down silently and still exits 0', async () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    startRunner([], { version: '1.0.0', ui, createUI: () => ui, io, binding: fakeBinding() });
    process.emit('SIGTERM');
    await delay(50);
    expect(ctx.out).toEqual([]);
    expect(ctx.exits).toEqual([0]);
  });

  it('quiet SIGINT stays silent but still exits 0', async () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', quiet: true }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      binding: fakeBinding()
    });
    process.emit('SIGINT');
    await delay(50);
    expect(ctx.out).toEqual([]);
    expect(ctx.exits).toEqual([0]);
    w.stop();
  });

  it('a child that ignores the kill runs into the 2s cap and exits without the stopped line', async () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const { io, ctx } = makeIO(direction);
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      binding: fakeBinding(),
      watcherFactory: (binding, options) => new StickyWatcher(binding, options)
    });
    rec.alive = true;
    process.emit('SIGINT');
    await delay(2400);
    expect(ctx.out.join('\n')).not.toContain('stopped');
    expect(ctx.exits).toEqual([0]);
    expect(w.stopped).toBe(true);
  }, 10_000);

  it('skips SIGHUP registration on win32', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const desc = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const { io } = makeIO(direction);
      const sighupBefore = process.listenerCount('SIGHUP');
      startRunner([], { version: '1.0.0', ui, createUI: () => ui, io, binding: fakeBinding() });
      expect(process.listenerCount('SIGHUP')).toBe(sighupBefore);
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(process, 'platform', desc);
    }
  });

  it('signals:false installs no handlers at all', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const baseline = totalSignalListeners();
    const { io } = makeIO(direction);
    startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(totalSignalListeners()).toBe(baseline);
  });
});

describe('startRunner: binding/factory seams', () => {
  it('without opts.binding it loads the real native binding (workspace build)', () => {
    const direction = temporaryProject({ 'app.js': 'console.log("boot"); process.exit(0);' });
    const { io } = makeIO(direction);
    const w = startRunner(['app.js'], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false
    });
    expect(w.requireId()).toBeGreaterThan(0);
    w.stop();
  });

  it('a custom watcherFactory receives the binding and its options', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const { io } = makeIO(direction);
    const factory = vi.fn(
      (binding: NativeBinding, o: ConstructorParameters<typeof NativeWatcher>[1]) =>
        new NativeWatcher(binding, o)
    );
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding(),
      watcherFactory: factory
    });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0]![1].script).toContain('app.js');
    w.stop();
  });
});

describe('wantsHelpOrVersion dispatch', () => {
  it('classifies -h / --help / --version / runner args', async () => {
    const { wantsHelpOrVersion } = await import('../../../src/cli/commands/start.js');
    expect(wantsHelpOrVersion(['-h'])).toBe('help');
    expect(wantsHelpOrVersion(['--help'])).toBe('help');
    expect(wantsHelpOrVersion(['--version'])).toBe('version');
    expect(wantsHelpOrVersion(['app.js', '-x', 'node'])).toBeNull();
  });
});
