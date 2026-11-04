/**
Native bridge contract + live lifecycle tests (spec §9).

These run against the REAL `nodeloop-native` binary built by cargo
(`cargo build --release -p nodeloop-native` — the loader's workspace
fallback finds it). If the binary is missing, `loadNativeBinding()`
throws the predictable NativeLoadError and the whole suite fails —
that is the contract, not an accident.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  isNativeAvailable,
  loadNativeBinding,
  NativeContractError,
  NativeLoadError,
  platformPackageName
} from '../../src/native/loader.js';
import type { NativeEvent } from '../../src/native/types.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const binding = loadNativeBinding();

/*
------------------------------ contract -------------------------------
*/

describe('native binding contract', () => {
  it('reports the workspace version (no hardcoded number)', () => {
    const package_ = JSON.parse(
      fs.readFileSync(path.resolve(testDirectory, '../../package.json'), 'utf8')
    ) as { version: string };
    expect(binding.coreVersion()).toBe(package_.version);
  });

  it('exposes the full NativeModule surface as functions', () => {
    for (const name of [
      'coreVersion',
      'watcherStart',
      'watcherStop',
      'watcherRestart',
      'watcherWriteStdin',
      'watcherChildAlive',
      'resolveSpawn'
    ]) {
      expect(typeof (binding as unknown as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('resolveSpawn through the bridge: windows bare name → cmd.exe shell', () => {
    const spec = binding.resolveSpawn('npm run dev', [], undefined, [], 'win32', process.execPath);
    expect(spec).toEqual({ file: 'npm run dev', args: [], shell: true });
  });

  it('resolveSpawn through the bridge: bare node → the running binary, direct', () => {
    const spec = binding.resolveSpawn('', [], 'app.js', ['--p'], 'linux', process.execPath);
    expect(spec.shell).toBe(false);
    expect(spec.file).toBe(process.execPath);
    expect(spec.args).toEqual(['app.js', '--p']);
  });

  it('resolveSpawn through the bridge: POSIX bare name spawns directly', () => {
    const spec = binding.resolveSpawn(
      'tsx src/main.ts',
      [],
      undefined,
      [],
      'linux',
      process.execPath
    );
    expect(spec).toEqual({ file: 'tsx', args: ['src/main.ts'], shell: false });
  });

  it('operations on an unknown id fail predictably', () => {
    expect(() => binding.watcherChildAlive(999_999)).toThrow(/not running/);
    expect(() => binding.watcherStop(999_999)).toThrow(/not running/);
    expect(() => binding.watcherRestart(999_999)).toThrow(/not running/);
    expect(() => binding.watcherWriteStdin(999_999, Buffer.from('x'))).toThrow(/not running/);
  });

  it('a missing NODELOOP_NATIVE_PATH raises the predictable load error', () => {
    const previous = process.env.NODELOOP_NATIVE_PATH;
    process.env.NODELOOP_NATIVE_PATH = '/definitely/not/here/nodeloop_native.node';
    try {
      expect(() => loadNativeBinding()).toThrow(NativeLoadError);
    } finally {
      if (previous === undefined) {
        delete process.env.NODELOOP_NATIVE_PATH;
      } else {
        process.env.NODELOOP_NATIVE_PATH = previous;
      }
    }
  });

  it('a garbage NODELOOP_NATIVE_PATH raises the contract error', () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-contract-'));
    const fake = path.join(direction, 'fake.node');
    fs.writeFileSync(fake, 'this is not a binary addon');
    const previous = process.env.NODELOOP_NATIVE_PATH;
    process.env.NODELOOP_NATIVE_PATH = fake;
    try {
      expect(() => loadNativeBinding()).toThrow(NativeContractError);
    } finally {
      if (previous === undefined) {
        delete process.env.NODELOOP_NATIVE_PATH;
      } else {
        process.env.NODELOOP_NATIVE_PATH = previous;
      }
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });

  it('isNativeAvailable() reflects reality and the platform package name is stable', () => {
    expect(isNativeAvailable()).toBe(true);
    expect(platformPackageName()).toContain(process.arch);
  });
});

/*
---------------------------- live lifecycle ----------------------------
*/

interface Running {
  id: number;
  events: NativeEvent[];
  stop(): void;
}

/**
Start a supervisor with its OWN event collector (no shared state).
*/
function startCollecting(config: string): Running {
  const events: NativeEvent[] = [];
  const id = binding.watcherStart(config, (_error, json) => {
    if (typeof json === 'string' && json) {
      events.push(JSON.parse(json) as NativeEvent);
    }
  });
  return {
    id,
    events,
    stop() {
      try {
        binding.watcherStop(id);
      } catch {
        /*
        already gone
        */
      }
    }
  };
}

function makeTemporaryApp(code: string): { direction: string; file: string } {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-native-'));
  const file = path.join(direction, 'app.js');
  fs.writeFileSync(file, code);
  return { direction, file };
}

function configJson(direction: string, script: string | null, exec: string | null): string {
  return JSON.stringify({
    script,
    scriptArgs: [],
    cwd: direction,
    exec,
    nodeArgs: [],
    ext: 'js',
    ignore: [],
    watch: [],
    delay: 80,
    maxWait: 0,
    killSignal: 'SIGTERM',
    killTimeout: 1000,
    pollInterval: 0,
    env: {},
    stdio: 'inherit'
  });
}

async function waitUntil(
  events: NativeEvent[],
  isPredicate: (evs: NativeEvent[]) => boolean
): Promise<void> {
  const started = Date.now();
  while (!isPredicate(events)) {
    if (Date.now() - started > 15_000) {
      throw new Error(`deadline: got ${JSON.stringify(events.map((error) => error.type))}`);
    }
    await delay(25);
  }
}

const directories: string[] = [];
const running: Running[] = [];
afterAll(() => {
  for (const r of running) {
    r.stop();
  }
  for (const d of directories) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('native supervisor lifecycle (real Rust core)', () => {
  it('spawns a long-running child and restarts it on a watched file change', async () => {
    const { direction, file } = makeTemporaryApp(
      'console.log("BOOT", process.pid); setInterval(() => {}, 1000);'
    );
    directories.push(direction);
    const run = startCollecting(configJson(direction, file, undefined));
    running.push(run);
    // first boot settles
    await waitUntil(run.events, (evs) =>
      evs.some((error) => error.type === 'spawn' && error.restarts === 0)
    );
    // trigger the change
    fs.writeFileSync(file, 'console.log("BOOT v2"); setInterval(() => {}, 1000);');
    await waitUntil(
      run.events,
      (evs) =>
        evs.some((error) => error.type === 'restart') &&
        evs.some((error) => error.type === 'spawn' && (error.restarts ?? 0) >= 1)
    );
    const types = run.events.map((error) => error.type);
    expect(types).toContain('spawn');
    expect(types).toContain('change');
    expect(types).toContain('queued');
    expect(types).toContain('debounced');
    expect(types).toContain('restart');
    const restart = run.events.find((error) => error.type === 'restart')!;
    expect(restart.file).toBe('app.js');
    expect(binding.watcherChildAlive(run.id)).toBe(true);
  }, 25_000);

  it('reports a crash (own non-zero exit) and keeps the watcher alive', async () => {
    const { direction, file } = makeTemporaryApp('process.exit(3);');
    directories.push(direction);
    const run = startCollecting(configJson(direction, file, undefined));
    running.push(run);
    await waitUntil(run.events, (evs) => evs.some((error) => error.type === 'crash'));
    const crash = run.events.find((error) => error.type === 'crash')!;
    expect(crash.code).toBe(3);
    const exit = run.events.find((error) => error.type === 'exit')!;
    expect(exit.code).toBe(3);
    expect(exit.signal).toBeNull();
    expect(binding.watcherChildAlive(run.id)).toBe(false);
  }, 25_000);

  it('reports a clean exit (code 0) without a crash event', async () => {
    const { direction, file } = makeTemporaryApp('console.log("done");');
    directories.push(direction);
    const run = startCollecting(configJson(direction, file, undefined));
    running.push(run);
    await waitUntil(run.events, (evs) =>
      evs.some((error) => error.type === 'exit' && error.code === 0)
    );
    expect(run.events.some((error) => error.type === 'crash')).toBe(false);
  }, 25_000);

  it('spawnError for an executable that does not exist (no exit event follows)', async () => {
    const { direction } = makeTemporaryApp('console.log("never");');
    directories.push(direction);
    const run = startCollecting(
      configJson(direction, undefined, '/nonexistent-nodeloop-binary-xyz')
    );
    running.push(run);
    await waitUntil(run.events, (evs) => evs.some((error) => error.type === 'spawnError'));
    const error = run.events.find((error) => error.type === 'spawnError')!;
    // node-parity error vocabulary — the JS humanizer keys on it
    expect(error.code).toBe('ENOENT');
    expect(error.message).toMatch(/^spawn .* ENOENT$/);
    expect(run.events.some((error) => error.type === 'exit')).toBe(false);
  }, 25_000);

  it('manual restart via watcherRestart: accounted as its own restart, no file', async () => {
    const { direction, file } = makeTemporaryApp(
      'console.log("BOOT"); setInterval(() => {}, 1000);'
    );
    directories.push(direction);
    const run = startCollecting(configJson(direction, file, undefined));
    running.push(run);
    await waitUntil(run.events, (evs) =>
      evs.some((error) => error.type === 'spawn' && error.restarts === 0)
    );
    binding.watcherRestart(run.id);
    await waitUntil(run.events, (evs) =>
      evs.some((error) => error.type === 'restart' && error.file === null && error.restarts >= 1)
    );
    const restart = run.events.find((error) => error.type === 'restart' && error.file === null)!;
    expect(restart.restarts).toBe(1);
    expect(run.events.some((error) => error.type === 'spawn' && error.restarts === 1)).toBe(true);
  }, 25_000);

  it('stop() ends the run loop and the child is not left alive', async () => {
    const { direction, file } = makeTemporaryApp('setInterval(() => {}, 1000);');
    directories.push(direction);
    const run = startCollecting(configJson(direction, file, undefined));
    await waitUntil(run.events, (evs) => evs.some((error) => error.type === 'spawn'));
    run.stop();
    // the registry entry is dropped by stop() — further operations fail
    // predictably, which is itself the "not running" proof
    expect(() => binding.watcherChildAlive(run.id)).toThrow(/not running/);
  }, 25_000);
});
