/**
startRunner — the remaining seams: the defaultIO surface itself, an
explicit --config file that EXISTS, and the restart event under --quiet.
*/
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startRunner, defaultIO } from '../../../src/cli/commands/start.js';
import { createUI } from '../../../src/terminal/ui.js';
import { NativeWatcher } from '../../../src/native/client.js';
import type { NativeBinding } from '../../../src/native/types.js';
import type { RunnerIO } from '../../../src/cli/commands/start.js';

const ui = createUI({ color: false });

interface Rec {
  start: string[];
  stop: number[];
}
const rec: Rec = { start: [], stop: [] };

function fakeBinding(): NativeBinding {
  return {
    coreVersion: () => '1.0.0',
    watcherStart: (configJson: string) => {
      rec.start.push(configJson);
      return 7;
    },
    watcherStop: (id: number) => void rec.stop.push(id),
    watcherRestart: () => {},
    watcherWriteStdin: () => true,
    watcherChildAlive: () => false,
    resolveSpawn: () => ({ file: 'node', args: [], shell: false })
  };
}

const directories: string[] = [];
function temporaryProject(files: Record<string, string>): string {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-sx-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(direction, name), content);
  }
  directories.push(direction);
  return direction;
}
afterEach(() => {
  rec.start = [];
  rec.stop = [];
});
afterAll(() => {
  for (const d of directories) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('defaultIO surface', () => {
  it('writes a trailing newline to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      defaultIO.out('hello');
      expect(spy).toHaveBeenCalledWith('hello\n');
    } finally {
      spy.mockRestore();
    }
  });

  it('reports the real stdin TTY-ness, env and cwd', () => {
    expect(defaultIO.stdinIsTTY()).toBe(Boolean(process.stdin.isTTY));
    expect(defaultIO.env()).toBe(process.env);
    expect(defaultIO.cwd()).toBe(process.cwd());
  });
});

describe('startRunner — explicit --config that exists', () => {
  it('loads the named file (not the detection chain)', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'wrong.js' }),
      'custom.json': JSON.stringify({ script: 'right.js' }),
      'right.js': 'x',
      'wrong.js': 'x'
    });
    const context = { out: [] as string[], err: [] as string[], exits: [] as number[] };
    const io: RunnerIO = {
      out: (s) => void context.out.push(s),
      err: (s) => void context.err.push(s),
      exit: () => {},
      cwd: () => direction,
      stdinIsTTY: () => false,
      env: () => ({})
    };
    const w = startRunner(['--config', 'custom.json'], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    const config = JSON.parse(rec.start[0]!) as { script: string };
    expect(config.script).toContain('right.js');
    expect(config.script).not.toContain('wrong.js');
    w.stop();
  });

  it('--quiet keeps restart announcements off too', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js', quiet: true }),
      'app.js': 'x'
    });
    const context = { out: [] as string[], err: [] as string[], exits: [] as number[] };
    const io: RunnerIO = {
      out: (s) => void context.out.push(s),
      err: (s) => void context.err.push(s),
      exit: () => {},
      cwd: () => direction,
      stdinIsTTY: () => false,
      env: () => ({})
    };
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    (w as unknown as { emit(n: string, p?: unknown): boolean }).emit('restart', {
      file: 'app.js',
      restarts: 1
    });
    (w as unknown as { emit(n: string, p?: unknown): boolean }).emit('spawn', { restarts: 1 });
    expect(context.out).toEqual([]);
    w.stop();
  });

  it('restart banner distinguishes manual (rs) from file-driven restarts', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const context = { out: [] as string[], err: [] as string[], exits: [] as number[] };
    const io: RunnerIO = {
      out: (s) => void context.out.push(s),
      err: (s) => void context.err.push(s),
      exit: () => {},
      cwd: () => direction,
      stdinIsTTY: () => false,
      env: () => ({})
    };
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    const emit = (p?: unknown): void =>
      void (w as unknown as { emit(n: string, p?: unknown): boolean }).emit('restart', p);
    emit({ file: 'app.js', restarts: 1 });
    expect(context.out.join('\n')).toContain('due to changes');
    emit({ file: undefined, restarts: 2 });
    expect(context.out.join('\n')).toContain('manually');
    w.stop();
  });

  it('spawn with restarts > 0 skips the banner block', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const context = { out: [] as string[], err: [] as string[], exits: [] as number[] };
    const io: RunnerIO = {
      out: (s) => void context.out.push(s),
      err: (s) => void context.err.push(s),
      exit: () => {},
      cwd: () => direction,
      stdinIsTTY: () => false,
      env: () => ({})
    };
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    const emit = (n: string, p?: unknown): void =>
      void (w as unknown as { emit(n: string, p?: unknown): boolean }).emit(n, p);
    emit('spawn', { restarts: 2 });
    const text = context.out.join('\n');
    expect(text).toContain('starting `node app.js`');
    expect(text).not.toContain('[nodeloop]');
    w.stop();
  });

  it('verbose startup without a config file skips the configLabel line', () => {
    const direction = temporaryProject({ 'app.js': 'x' });
    const context = { out: [] as string[], err: [] as string[], exits: [] as number[] };
    const io: RunnerIO = {
      out: (s) => void context.out.push(s),
      err: (s) => void context.err.push(s),
      exit: () => {},
      cwd: () => direction,
      stdinIsTTY: () => false,
      env: () => ({})
    };
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    const emit = (n: string, p?: unknown): void =>
      void (w as unknown as { emit(n: string, p?: unknown): boolean }).emit(n, p);
    // verbose via env or CLI flag — no config file means configLabel is null
    emit('spawn', { restarts: 0 });
    const text = context.out.join('\n');
    expect(text).toContain('starting `node app.js`');
    expect(text).not.toContain('config:');
    w.stop();
  });

  it('SIGINT with no live child skips the terminating line', async () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const context = { out: [] as string[], err: [] as string[], exits: [] as number[] };
    const io: RunnerIO = {
      out: (s) => void context.out.push(s),
      err: (s) => void context.err.push(s),
      exit: (code) => {
        context.exits.push(code);
      },
      cwd: () => direction,
      stdinIsTTY: () => false,
      env: () => ({})
    };
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      binding: fakeBinding()
    });
    // rec.alive stays false → hasLiveChild() returns false
    process.emit('SIGINT');
    void (w as unknown as { emit(n: string, p?: unknown): boolean }).emit('exit', {
      code: undefined,
      signal: 'SIGTERM'
    });
    await delay(50);
    const text = context.out.join('\n');
    expect(text).toContain('stopping');
    expect(text).not.toContain('terminating');
    expect(context.exits).toEqual([0]);
  });
});

describe('NativeWatcher is EventEmitter-compatible with the wiring', () => {
  it('startRunner wires every documented event without throwing', () => {
    const direction = temporaryProject({
      'nodeloop.json': JSON.stringify({ script: 'app.js' }),
      'app.js': 'x'
    });
    const context = { out: [] as string[], err: [] as string[], exits: [] as number[] };
    const io: RunnerIO = {
      out: (s) => void context.out.push(s),
      err: (s) => void context.err.push(s),
      exit: () => {},
      cwd: () => direction,
      stdinIsTTY: () => false,
      env: () => ({})
    };
    const w = startRunner([], {
      version: '1.0.0',
      ui,
      createUI: () => ui,
      io,
      signals: false,
      binding: fakeBinding()
    });
    expect(w).toBeInstanceOf(NativeWatcher);
    expect(
      w
        .eventNames()
        .map(String)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(
      [
        'change',
        'crash',
        'debounced',
        'error',
        'exit',
        'queued',
        'restart',
        'spawn',
        'spawnError',
        'stopping'
      ].toSorted((a, b) => a.localeCompare(b))
    );
    w.stop();
  });
});
