import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  noScriptHint,
  requireScriptOrExec,
  resolveScript,
  resolveScriptChain
} from '../../../src/runtime/script-resolver.js';
import { NoScriptError, NodeloopError } from '../../../src/errors/types.js';

function captureError(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return undefined;
}

const directories: string[] = [];
const makeDirection = (): string => {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nodeloop-resolver-'));
  directories.push(direction);
  return direction;
};

afterAll(() => {
  for (const direction of directories.splice(0)) {
    fs.rmSync(direction, { recursive: true, force: true });
  }
});

describe('resolveScriptChain', () => {
  it('uses package.json "main" first', () => {
    const direction = makeDirection();
    fs.writeFileSync(
      path.join(direction, 'package.json'),
      JSON.stringify({ name: 'x', main: 'app.js' })
    );
    expect(resolveScriptChain(direction)).toBe('app.js');
  });

  it('falls back to index.js when package.json has no main', () => {
    const direction = makeDirection();
    fs.writeFileSync(path.join(direction, 'package.json'), JSON.stringify({ name: 'x' }));
    fs.writeFileSync(path.join(direction, 'index.js'), 'console.log(1)\n');
    expect(resolveScriptChain(direction)).toBe('index.js');
  });

  it('falls back to server.js when only server.js exists', () => {
    const direction = makeDirection();
    fs.writeFileSync(path.join(direction, 'server.js'), 'console.log(1)\n');
    expect(resolveScriptChain(direction)).toBe('server.js');
  });

  it('ignores a broken package.json and falls through to index.js', () => {
    const direction = makeDirection();
    fs.writeFileSync(path.join(direction, 'package.json'), '{ this is not json');
    fs.writeFileSync(path.join(direction, 'index.js'), 'console.log(1)\n');
    expect(resolveScriptChain(direction)).toBe('index.js');
  });

  it('returns null when nothing matches', () => {
    expect(resolveScriptChain(makeDirection())).toBeNull();
  });
});

describe('resolveScript precedence', () => {
  it('the CLI token wins over the config script', () => {
    const direction = makeDirection();
    expect(resolveScript('cli.js', 'config.js', direction)).toBe('cli.js');
  });

  it('the config script wins over the default chain', () => {
    const direction = makeDirection();
    fs.writeFileSync(path.join(direction, 'index.js'), 'console.log(1)\n');
    expect(resolveScript(undefined, 'config.js', direction)).toBe('config.js');
  });

  it('the default chain fills in when neither CLI nor config gave a script', () => {
    const direction = makeDirection();
    fs.writeFileSync(path.join(direction, 'server.js'), 'console.log(1)\n');
    expect(resolveScript(undefined, undefined, direction)).toBe('server.js');
  });
});

describe('noScriptHint', () => {
  it('with a config label, tells the user to add script/exec to THAT file', () => {
    const hint = noScriptHint('nodeloop.json');
    expect(hint).toContain('nodeloop.json loaded, but it has no "script" or "exec" key');
    expect(hint).toContain('nodeloop --exec "npm run dev"');
  });

  it('without a config, gives the generic guidance', () => {
    expect(noScriptHint(undefined)).toContain(
      'set "script" (entry file) or "exec" (command, e.g. "npm run dev") in a config file'
    );
  });
});

describe('requireScriptOrExec', () => {
  it('throws NoScriptError with the config-aware hint when a config was loaded', () => {
    const error = captureError(() => requireScriptOrExec(false, 'nodeloop.json'));
    expect(error).toBeInstanceOf(NoScriptError);
    expect(error).toBeInstanceOf(NodeloopError);
    const noScript = error as NoScriptError;
    expect(noScript.message).toBe('no script given and none found');
    expect(noScript.hint).toContain('loaded, but it has no "script" or "exec" key');
  });

  it('throws NoScriptError with the generic hint when there is no config', () => {
    const error = captureError(() => requireScriptOrExec(false, undefined));
    expect(error).toBeInstanceOf(NoScriptError);
    expect((error as NoScriptError).hint).toContain('set "script" (entry file)');
  });

  it('does not throw when an exec command is configured', () => {
    expect(() => requireScriptOrExec(true, undefined)).not.toThrow();
    expect(() => requireScriptOrExec(true, 'nodeloop.json')).not.toThrow();
  });
});
