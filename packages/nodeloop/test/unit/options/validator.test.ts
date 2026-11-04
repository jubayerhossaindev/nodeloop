import { afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateScript, LAG_COMMAND } from '../../../src/cli/options/validator.js';
import {
  NodeloopError,
  ScriptIsDirectoryError,
  ScriptNotFoundError
} from '../../../src/errors/types.js';
import { MESSAGES } from '../../../src/errors/messages.js';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-val-'));

function captureError(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return undefined;
}

afterAll(() => {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('validateScript — missing script', () => {
  it('nonexistent path → ScriptNotFoundError with message `script not found: <s>`', () => {
    const missing = path.join(temporaryRoot, 'does-not-exist.js');
    const error = captureError(() => validateScript('does-not-exist.js', missing, temporaryRoot));
    expect(error).toBeInstanceOf(ScriptNotFoundError);
    expect(error).toBeInstanceOf(NodeloopError);
    expect((error as Error).message).toBe('script not found: does-not-exist.js');
  });

  it(`the special '${LAG_COMMAND}' case gets the dedicated hint and the documented 'no lag monitor' wording`, () => {
    const missing = path.join(temporaryRoot, 'lag');
    const error = captureError(() => validateScript(LAG_COMMAND, missing, temporaryRoot));
    // legacy parity: the FULL lag wording IS the fatal message
    expect(error).toBeInstanceOf(NodeloopError);
    expect((error as Error).message).toBe(MESSAGES.lagNotSupported);
    expect((error as Error).message).toContain('script not found: lag');
    expect((error as NodeloopError).hint).toContain('to run your app');
    // The user-visible lag wording shipped in the messages module:
    expect(MESSAGES.lagNotSupported).toContain('no lag monitor');
    expect(MESSAGES.lagNotSupported.startsWith('script not found: lag')).toBe(true);
  });
});

describe('validateScript — directory scripts', () => {
  it('directory WITHOUT index.js/package.json inside → ScriptIsDirectoryError', () => {
    const direction = path.join(temporaryRoot, 'bare-direction');
    fs.mkdirSync(direction);
    const error = captureError(() => validateScript('bare-direction', direction, temporaryRoot));
    expect(error).toBeInstanceOf(ScriptIsDirectoryError);
    expect((error as Error).message).toContain('script is a directory: bare-direction');
    expect((error as Error).message).toContain('index.js or package.json');
    expect((error as NodeloopError).hint).toContain('nodeloop --exec');
  });

  it('directory WITH index.js inside → no throw, isDirectory true', () => {
    const direction = path.join(temporaryRoot, 'entry-direction');
    fs.mkdirSync(direction);
    fs.writeFileSync(path.join(direction, 'index.js'), 'console.log(1);\n');
    const result = validateScript('entry-direction', direction, temporaryRoot);
    expect(result).toEqual({ scriptPath: direction, isDirectory: true });
  });

  it('directory with package.json (but no index.js) inside → no throw, isDirectory true', () => {
    const direction = path.join(temporaryRoot, 'pkg-direction');
    fs.mkdirSync(direction);
    fs.writeFileSync(path.join(direction, 'package.json'), '{"name":"app"}\n');
    expect(validateScript('pkg-direction', direction, temporaryRoot)).toEqual({
      scriptPath: direction,
      isDirectory: true
    });
  });
});

describe('validateScript — plain file and exec-only runs', () => {
  it('a plain existing file → { scriptPath, isDirectory: false }', () => {
    const file = path.join(temporaryRoot, 'app.js');
    fs.writeFileSync(file, 'console.log(1);\n');
    expect(validateScript('app.js', file, temporaryRoot)).toEqual({
      scriptPath: file,
      isDirectory: false
    });
  });

  it('null scriptPath (exec-only run) → no throw, { scriptPath: null, isDirectory: false }', () => {
    expect(validateScript(undefined, undefined, temporaryRoot)).toEqual({
      scriptPath: undefined,
      isDirectory: false
    });
  });
});
