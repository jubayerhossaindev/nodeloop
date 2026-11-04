/**
NativeWatcher — the TypeScript face of the Rust supervisor — driven by a
recording fake binding. Every method, every event type, every branch.
*/
import { describe, it, expect } from 'vitest';
import { NativeWatcher } from '../../../src/native/client.js';
import { NativeOperationError } from '../../../src/native/errors.js';
import type { NativeBinding } from '../../../src/native/types.js';

interface Recording {
  start: string[];
  stop: number[];
  restart: number[];
  write: Array<{ id: number; data: Buffer }>;
  alive: boolean;
}

function fakeBinding(rec: Recording): NativeBinding {
  return {
    coreVersion: () => '1.0.0',
    watcherStart: (configJson: string) => {
      rec.start.push(configJson);
      return 42;
    },
    watcherStop: (id: number) => {
      rec.stop.push(id);
    },
    watcherRestart: (id: number) => {
      rec.restart.push(id);
    },
    watcherWriteStdin: (id: number, data: Buffer) => {
      rec.write.push({ id, data });
      return true;
    },
    watcherChildAlive: () => rec.alive,
    resolveSpawn: (
      exec: string,
      nodeArguments: string[],
      script: string | null,
      arguments_: string[]
    ) => ({
      file: exec || 'node',
      args: [...nodeArguments, ...(script ? [script] : []), ...arguments_],
      shell: false
    })
  };
}

function newRec(): Recording {
  return { start: [], stop: [], restart: [], write: [], alive: false };
}

const noopNativeCallback = (_error: unknown, _json: string): void => {};

function startWithCapture(
  rec: Recording,
  options?: ConstructorParameters<typeof NativeWatcher>[1]
): { w: NativeWatcher; cb: (error: unknown, json: string) => void } {
  let callback: (error: unknown, json: string) => void = noopNativeCallback;
  const binding = fakeBinding(rec);
  const real = binding.watcherStart;
  binding.watcherStart = (configJson: string, onEvent: (error: unknown, json: string) => void) => {
    callback = onEvent;
    return real(configJson, onEvent);
  };
  const w = new NativeWatcher(binding, options);
  return { w, cb: (error, json) => callback(error, json) };
}

describe('NativeWatcher construction', () => {
  it('applies every documented default', () => {
    const rec = newRec();
    const { w } = startWithCapture(rec, { script: 'app.js' });
    expect(w.delay).toBe(200);
    expect(w.maxWait).toBe(0);
    expect(w.killSignal).toBe('SIGTERM');
    expect(w.killTimeout).toBe(3000);
    expect(w.pollInterval).toBe(0);
    expect(w.exts.length).toBeGreaterThan(0);
    expect(w.ignoreDisplay).toContain('node_modules');
    expect(w.watchPaths).toEqual([]); // no watch scopes → Rust watches cwd root
    expect(w.lastChange).toBeNull();
    expect(w.stopped).toBe(false);
  });

  it('serializes the native config from the given options', () => {
    const rec = newRec();
    const { w } = startWithCapture(rec, {
      script: 'srv.js',
      scriptArgs: ['--port', '3000'],
      cwd: '/tmp/proj',
      exec: 'deno run',
      nodeArgs: ['--harmony'],
      ext: 'js,ts',
      ignore: ['dist'],
      watch: ['src'],
      delay: '350',
      maxWait: 1000,
      killSignal: 'SIGKILL',
      killTimeout: '1500',
      legacyWatch: 250,
      env: { FOO: 'bar' },
      interactiveStdin: true
    });
    w.start();
    expect(rec.start).toHaveLength(1);
    const config = JSON.parse(rec.start[0]!) as Record<string, unknown>;
    expect(config['script']).toBe('srv.js');
    expect(config['scriptArgs']).toEqual(['--port', '3000']);
    expect(config['cwd']).toBe('/tmp/proj');
    expect(config['exec']).toBe('deno run');
    expect(config['nodeArgs']).toEqual(['--harmony']);
    expect(config['ext']).toBe('js,ts');
    expect(config['ignore']).toContain('dist');
    expect(config['watch']).toEqual(['src']);
    expect(config['delay']).toBe(350);
    expect(config['maxWait']).toBe(1000);
    expect(config['killSignal']).toBe('SIGKILL');
    expect(config['killTimeout']).toBe(1500);
    expect(config['pollInterval']).toBe(250);
    expect(config['env']).toEqual({ FOO: 'bar' });
    expect(config['stdio']).toBe('interactive');
  });

  it('interactiveStdin off → stdio inherit; empty exts → ext null', () => {
    const rec = newRec();
    const { w } = startWithCapture(rec, { script: 'a.js', ext: '' });
    w.start();
    const config = JSON.parse(rec.start[0]!) as Record<string, unknown>;
    expect(config['stdio']).toBe('inherit');
    expect(config['ext']).toBeNull();
  });

  it('display() mirrors the display fields', () => {
    const rec = newRec();
    const { w } = startWithCapture(rec, { script: 'a.js', delay: 5 });
    const d = w.display();
    expect(d.delay).toBe(5);
    expect(d).toEqual({
      watchPaths: w.watchPaths,
      exts: w.exts,
      ignoreDisplay: w.ignoreDisplay,
      delay: w.delay,
      maxWait: w.maxWait,
      killSignal: w.killSignal,
      killTimeout: w.killTimeout,
      pollInterval: w.pollInterval
    });
  });
});

describe('NativeWatcher lifecycle', () => {
  it('start() wires the callback, queries liveness and clears stopped', () => {
    const rec = newRec();
    rec.alive = true;
    const { w } = startWithCapture(rec, { script: 'a.js' });
    w.stopped = true;
    w.start();
    expect(w.stopped).toBe(false);
    expect(rec.start).toHaveLength(1);
    expect(w.hasLiveChild()).toBe(true);
  });

  it('stop() calls the bridge once, then is a no-op; liveness goes false', () => {
    const rec = newRec();
    rec.alive = true;
    const { w } = startWithCapture(rec, { script: 'a.js' });
    w.start();
    w.stop();
    expect(rec.stop).toEqual([42]);
    expect(w.stopped).toBe(true);
    expect(w.hasLiveChild()).toBe(false);
    rec.stop.length = 0;
    w.stop();
    expect(rec.stop).toEqual([]); // second stop is a no-op
  });

  it('restart() only fires on a running watcher', () => {
    const rec = newRec();
    const { w } = startWithCapture(rec, { script: 'a.js' });
    w.restart(); // never started → ignored
    expect(rec.restart).toEqual([]);
    w.start();
    w.restart();
    expect(rec.restart).toEqual([42]);
    w.stop();
    w.restart(); // stopped → ignored
    expect(rec.restart).toEqual([42]);
  });

  it('writeStdin forwards a Buffer only while running', () => {
    const rec = newRec();
    const { w } = startWithCapture(rec, { script: 'a.js' });
    expect(w.writeStdin('hi')).toBe(false); // id null
    w.start();
    expect(w.writeStdin('hi')).toBe(true);
    expect(rec.write[0]!.id).toBe(42);
    expect(rec.write[0]!.data.toString()).toBe('hi');
    w.stop();
    expect(w.writeStdin('hi')).toBe(false); // stopped
  });

  it('onChildExit resolves immediately without a live child', async () => {
    const rec = newRec();
    const { w } = startWithCapture(rec, { script: 'a.js' });
    await expect(w.onChildExit()).resolves.toBeUndefined();
  });

  it('onChildExit resolves when the exit event arrives', async () => {
    const rec = newRec();
    rec.alive = true;
    const { w } = startWithCapture(rec, { script: 'a.js' });
    w.start();
    const pending = w.onChildExit();
    w.emit('exit', { code: 0, signal: undefined });
    await expect(pending).resolves.toBeUndefined();
  });

  it('requireId throws the predictable operation error before start', () => {
    const rec = newRec();
    const { w } = startWithCapture(rec, { script: 'a.js' });
    expect(() => w.requireId()).toThrow(NativeOperationError);
    expect(() => w.requireId()).toThrow(/never started/);
    w.start();
    expect(w.requireId()).toBe(42);
  });
});

describe('NativeWatcher event handling', () => {
  it('maps every native event type to its EventEmitter event', () => {
    const rec = newRec();
    const { w, cb } = startWithCapture(rec, { script: 'a.js' });
    w.start();
    const seen: Array<[string, unknown]> = [];
    for (const name of [
      'change',
      'queued',
      'debounced',
      'restart',
      'stopping',
      'spawn',
      'spawnError',
      'exit',
      'crash',
      'error'
    ]) {
      w.on(name, (payload: unknown) => {
        seen.push([name, payload]);
      });
    }

    cb(undefined, JSON.stringify({ type: 'change', file: 'a.js' }));
    cb(undefined, JSON.stringify({ type: 'queued', file: 'a.js', wait: 200 }));
    cb(undefined, JSON.stringify({ type: 'debounced' }));
    cb(undefined, JSON.stringify({ type: 'restart', file: 'a.js', restarts: 1 }));
    cb(undefined, JSON.stringify({ type: 'stopping' }));
    cb(undefined, JSON.stringify({ type: 'spawn', restarts: 1 }));
    cb(
      undefined,
      JSON.stringify({ type: 'spawnError', message: 'spawn x ENOENT', code: 'ENOENT', path: '/x' })
    );
    cb(undefined, JSON.stringify({ type: 'exit', code: 0, signal: undefined }));
    cb(undefined, JSON.stringify({ type: 'crash', code: 3 }));
    cb(undefined, JSON.stringify({ type: 'error', message: 'watch failed' }));

    const names = seen.map(([n]) => n);
    expect(names).toEqual([
      'change',
      'queued',
      'debounced',
      'restart',
      'stopping',
      'spawn',
      'spawnError',
      'exit',
      'crash',
      'error'
    ]);
    expect(seen[0]![1]).toEqual({ file: 'a.js' });
    expect(seen[1]![1]).toEqual({ file: 'a.js', wait: 200 });
    expect(seen[5]![1]).toEqual({ restarts: 1 });
    expect(seen[6]![1]).toEqual({
      error: { message: 'spawn x ENOENT', code: 'ENOENT', path: '/x' }
    });
    expect(seen[7]![1]).toEqual({ code: 0, signal: undefined });
    expect(seen[8]![1]).toEqual({ code: 3 });
    expect(seen[9]![1]).toBeInstanceOf(Error);
    // spawn set liveness, exit cleared it
    expect(w.hasLiveChild()).toBe(false);
    // change blamed the file
    expect(w.lastChange).toBe('a.js');
  });

  it('unparsable event JSON raises the error event', () => {
    const rec = newRec();
    const { w, cb } = startWithCapture(rec, { script: 'a.js' });
    w.start();
    const errors: Error[] = [];
    w.on('error', (error: Error) => {
      errors.push(error);
    });
    cb(undefined, '{not-json');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/unparsable native event/);
  });

  it('a bridge-level error callback raises the error event (Error and non-Error)', () => {
    const rec = newRec();
    const { w, cb } = startWithCapture(rec, { script: 'a.js' });
    w.start();
    const errors: Error[] = [];
    w.on('error', (error: Error) => {
      errors.push(error);
    });
    cb(new Error('bridge down'), '');
    cb('boom-string', '');
    expect(errors).toHaveLength(2);
    expect(errors[0]!.message).toBe('bridge down');
    expect(errors[1]!.message).toBe('boom-string');
  });

  it('spawn and exit events update liveness tracking', () => {
    const rec = newRec();
    rec.alive = false;
    const { w, cb } = startWithCapture(rec, { script: 'a.js' });
    w.start();
    expect(w.hasLiveChild()).toBe(false);
    cb(undefined, JSON.stringify({ type: 'spawn', restarts: 0 }));
    rec.alive = true; // the real binding reports the child as running now
    expect(w.hasLiveChild()).toBe(true);
    cb(undefined, JSON.stringify({ type: 'exit', code: 1, signal: undefined }));
    rec.alive = false; // the real binding reports the child as gone
    expect(w.hasLiveChild()).toBe(false);
  });
});
