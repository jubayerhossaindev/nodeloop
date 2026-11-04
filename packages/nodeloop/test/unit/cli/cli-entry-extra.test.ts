/**
cli.ts — the config `colours: false` rebuild path through the real entry.
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

beforeEach(() => {
  exitSpy.mockImplementation(((code?: number) => {
    throw new ExitSentinel(code);
  }) as typeof process.exit);
  writeSpy.mockImplementation(() => {});
  errorSpy.mockImplementation(() => true);
});
afterEach(() => {
  exitSpy.mockReset();
  writeSpy.mockReset();
  errorSpy.mockReset();
  process.argv = originalArgv;
  process.chdir(originalCwd);
});
afterAll(() => vi.restoreAllMocks());

describe('cli entry — colours:false rebuild', () => {
  it('a config with colours:false rebuilds the UI before the fatal render (no ANSI)', async () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-cli-colors-'));
    fs.writeFileSync(path.join(direction, 'nodeloop.json'), JSON.stringify({ colours: false }));
    try {
      process.chdir(direction);
      vi.resetModules();
      process.argv = ['node', 'cli'];
      let caught: unknown;
      try {
        await import('../../../src/cli.js');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ExitSentinel);
      expect((caught as ExitSentinel).code).toBe(1); // NoScriptError → exit 1
      const stderr = errorSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).toContain('no script given and none found');
      expect(stderr).not.toContain('\u{1B}['); // the rebuilt colorless UI rendered it
    } finally {
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });
});
