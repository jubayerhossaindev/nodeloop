/**
The CLI entry module (`src/cli.ts`) executes top-level code the moment it
is imported: version read from package.json, UI creation, the help/version
short-circuits and the runner dispatch with the legacy fatal() contract.
Each test re-imports the module fresh with a controlled argv; `process.exit`
is stubbed to throw a sentinel so the exit path is observable in-process.
*/
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

class ExitSentinel extends Error {
  constructor(readonly code: number | undefined) {
    super(`__exit_${code}`);
  }
}

const originalArgv = process.argv;
const originalCwd = process.cwd();

const writeSpy = vi.spyOn(process.stdout, 'write');
const errorSpy = vi.spyOn(process.stderr, 'write');
const exitSpy = vi.spyOn(process, 'exit');

/**
Throw either a sentinel Error or a raw string (non-Error fatal path).
*/
function installExit(throwValue: unknown): void {
  exitSpy.mockImplementation(((code?: number) => {
    throw throwValue instanceof ExitSentinel ? new ExitSentinel(code) : throwValue;
  }) as typeof process.exit);
  writeSpy.mockImplementation(() => true);
  errorSpy.mockImplementation(() => true);
}

async function runCli(argv: string[]): Promise<unknown> {
  vi.resetModules();
  process.argv = ['node', 'cli', ...argv];
  try {
    await import('../../../src/cli.js');
  } catch (error) {
    return error;
  }
  throw new Error('cli.ts did not exit — expected an ExitSentinel');
}

beforeEach(() => {
  installExit(new ExitSentinel(undefined));
});
afterEach(() => {
  exitSpy.mockReset();
  writeSpy.mockReset();
  errorSpy.mockReset();
  process.argv = originalArgv;
  process.chdir(originalCwd);
});
afterAll(() => vi.restoreAllMocks());

describe('cli entry: help + version short-circuit', () => {
  it('--help prints the full help screen and exits 0', async () => {
    installExit(new ExitSentinel(undefined));
    const error = (await runCli(['--help'])) as ExitSentinel;
    expect(error).toBeInstanceOf(ExitSentinel);
    expect(error.code).toBe(0);
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('USAGE');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('-h short-circuits too', async () => {
    installExit(new ExitSentinel(undefined));
    const error = (await runCli(['-h'])) as ExitSentinel;
    expect(error.code).toBe(0);
  });

  it('--version prints the package.json banner and exits 0', async () => {
    installExit(new ExitSentinel(undefined));
    const error = (await runCli(['--version'])) as ExitSentinel;
    expect(error).toBeInstanceOf(ExitSentinel);
    expect(error.code).toBe(0);
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('[nodeloop]');
    expect(printed).toContain('1.0.0'); // from package.json — never hardcoded
  });
});

describe('cli entry: fatal paths through the catch', () => {
  it('a missing --config file: catch writes the fatal line, exits 1', async () => {
    installExit(new ExitSentinel(undefined));
    const error = (await runCli(['--config', 'definitely-missing.json'])) as ExitSentinel;
    expect(error).toBeInstanceOf(ExitSentinel);
    expect(error.code).toBe(1);
    const stderr = errorSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderr.length).toBeGreaterThan(0); // fatal rendered
  });

  it('a NodeloopError with a hint renders message + hint, exits 1', async () => {
    installExit(new ExitSentinel(undefined));
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-cli-entry-'));
    try {
      process.chdir(direction);
      const error = (await runCli([])) as ExitSentinel;
      expect(error).toBeInstanceOf(ExitSentinel);
      expect(error.code).toBe(1);
      const stderr = errorSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).toContain('no script given and none found');
      expect(stderr).toContain('set "script"'); // the config-aware hint
    } finally {
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });

  it('a non-Error thrown value goes through String() and prints without a hint', async () => {
    installExit('EXIT:1'); // raw string sentinel — exercises the String(err) branch
    const error = await runCli(['--config', 'definitely-missing.json']);
    expect(error).toBe('EXIT:1'); // startRunner → io.exit → string thrown into the catch
    const stderr = errorSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderr).toContain('config file not found'); // rendered by startRunner
    expect(stderr).toContain('EXIT:1'); // rendered by the catch via String(err)
  });
});
