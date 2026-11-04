/**
validateScript coverage beyond the main suite: the null-script guard,
the `script ?? scriptPath` message fallback, the directory checks and
the exported scriptExtension helper.
*/
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateScript,
  scriptExtension,
  LAG_COMMAND
} from '../../../src/cli/options/validator.js';
import {
  NodeloopError,
  ScriptIsDirectoryError,
  ScriptNotFoundError
} from '../../../src/errors/types.js';

const directories: string[] = [];
function captureError(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return undefined;
}

function temporary(): { direction: string; clean: () => void } {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-vs-'));
  directories.push(direction);
  return { direction, clean: () => {} };
}
afterAll(() => {
  for (const d of directories) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('validateScript — extra branches', () => {
  it('scriptExtension derives the lowercase extension', () => {
    expect(scriptExtension('/x/App.TS')).toBe('ts');
    expect(scriptExtension('noext')).toBe('');
  });

  it('a missing path with a null script reports the PATH (script ?? scriptPath)', () => {
    const error = captureError(() =>
      validateScript(undefined, '/definitely/missing/x.js', os.tmpdir())
    );
    expect(error).toBeInstanceOf(ScriptNotFoundError);
    expect((error as ScriptNotFoundError).message).toContain('/definitely/missing/x.js');
  });

  it('the lag special case keeps its dedicated wording', () => {
    const error = captureError(() =>
      validateScript(LAG_COMMAND, '/definitely/missing/lag', os.tmpdir())
    );
    expect(error).toBeInstanceOf(NodeloopError);
    expect(typeof (error as NodeloopError).message).toBe('string');
    expect((error as NodeloopError).message).toContain('no lag monitor');
  });

  it('a directory WITHOUT entry files is rejected', () => {
    const { direction } = temporary();
    const sub = path.join(direction, 'somedir');
    fs.mkdirSync(sub);
    expect(() => validateScript('somedir', sub, direction)).toThrow(ScriptIsDirectoryError);
  });

  it('a null script falling into the directory check reports the PATH', () => {
    const { direction } = temporary();
    const sub = path.join(direction, 'nulldir');
    fs.mkdirSync(sub);
    const error = captureError(() => validateScript(undefined, sub, direction));
    expect(error).toBeInstanceOf(ScriptIsDirectoryError);
    expect((error as ScriptIsDirectoryError).message).toContain(sub);
  });

  it('a directory WITH index.js is accepted as a runnable directory', () => {
    const { direction } = temporary();
    const sub = path.join(direction, 'pkg');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'index.js'), 'x');
    expect(validateScript('pkg', sub, direction)).toEqual({ scriptPath: sub, isDirectory: true });
  });

  it('a directory WITH package.json is accepted too', () => {
    const { direction } = temporary();
    const sub = path.join(direction, 'pkg2');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'package.json'), '{}');
    expect(validateScript('pkg2', sub, direction)).toEqual({ scriptPath: sub, isDirectory: true });
  });
});
