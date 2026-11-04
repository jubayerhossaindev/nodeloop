import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isExecutableFile,
  resolveSpawn,
  tokenizeCommand,
  winQuote,
  type SpawnSpec
} from '../../../src/runtime/command.js';

const isPosixFixture = (candidate: string): boolean => candidate === '/opt/my tools/app';

describe('tokenizeCommand', () => {
  it('splits a plain command on spaces', () => {
    expect(tokenizeCommand('npm run dev')).toEqual(['npm', 'run', 'dev']);
  });

  it('keeps a quoted path containing spaces as ONE token', () => {
    expect(tokenizeCommand(String.raw`"C:\Program Files\node\node.exe"`)).toEqual([
      String.raw`C:\Program Files\node\node.exe`
    ]);
  });

  it('honors single quotes', () => {
    expect(tokenizeCommand("exec 'my script arg' --flag")).toEqual([
      'exec',
      'my script arg',
      '--flag'
    ]);
  });

  it('unescapes escaped double quotes inside double quotes', () => {
    expect(tokenizeCommand(String.raw`"a\"b"`)).toEqual(['a"b']);
  });

  it('keeps backslashes literal inside double quotes (Windows paths)', () => {
    expect(tokenizeCommand(String.raw`"C:\Users\temp direction"`)).toEqual([
      String.raw`C:\Users\temp direction`
    ]);
  });

  it('tolerates an unmatched quote and keeps the rest', () => {
    expect(tokenizeCommand("hello 'world")).toEqual(['hello', 'world']);
  });

  it('treats tabs, newlines and CR as token separators', () => {
    expect(tokenizeCommand('a\tb\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns [] for empty, undefined and null input', () => {
    expect(tokenizeCommand('')).toEqual([]);
    expect(tokenizeCommand(undefined)).toEqual([]);
    // The exported helper accepts null as an absent command.
    expect(tokenizeCommand(null)).toEqual([]);
  });
});

describe('winQuote', () => {
  it('leaves a plain token unchanged', () => {
    expect(winQuote('npm')).toBe('npm');
  });

  it('quotes a token containing a space', () => {
    expect(winQuote('my app.ts')).toBe('"my app.ts"');
  });

  it('quotes the empty string as ""', () => {
    expect(winQuote('')).toBe('""');
  });

  it('doubles backslashes before an embedded quote (MSVCRT argv rules)', () => {
    // token a\"b  →  "a\\\"b" : the literal backslash doubles, the quote is escaped
    expect(winQuote(String.raw`a\"b`)).toBe(String.raw`"a\\\"b"`);
  });

  it('doubles a trailing backslash when quoting (token has a space, so it gets quoted)', () => {
    // 'a b\' → trailing backslash doubled by the /(\\*)$/ rule, then wrapped
    expect(winQuote('a b\\')).toBe(String.raw`"a b\\"`);
  });

  it('returns a token unchanged when it has no space or quote (even with a trailing backslash)', () => {
    expect(winQuote('a\\')).toBe('a\\');
  });
});

describe('resolveSpawn', () => {
  it('(a) undefined exec → the running node binary, direct spawn, args [nodeArgs, script, scriptArgs]', () => {
    const spec: SpawnSpec = resolveSpawn(undefined, ['--inspect'], 'app.js', ['--port', '3000'], {
      platform: 'linux'
    });
    expect(spec).toEqual({
      file: process.execPath,
      args: ['--inspect', 'app.js', '--port', '3000'],
      shell: false
    });
  });

  it('(a2) empty/whitespace exec behaves like no exec', () => {
    expect(resolveSpawn('', [], 'app.js', [], { platform: 'linux' })).toEqual({
      file: process.execPath,
      args: ['app.js'],
      shell: false
    });
    expect(resolveSpawn(' '.repeat(3), [], undefined, [], { platform: 'linux' })).toEqual({
      file: process.execPath,
      args: [],
      shell: false
    });
  });

  it('(b) node / NODE / node.exe → the running binary, direct spawn', () => {
    for (const exec of ['node', 'NODE', 'node.exe']) {
      const spec: SpawnSpec = resolveSpawn(exec, ['--inspect'], 'app.js', [], {
        platform: 'linux',
        isExists: () => false
      });
      expect(spec).toEqual({ file: process.execPath, args: ['--inspect', 'app.js'], shell: false });
    }
  });

  it('(c) POSIX bare name spawns directly (PATH + shebang), shell false', () => {
    const spec: SpawnSpec = resolveSpawn('tsx', [], 'src/main.ts', [], {
      platform: 'linux',
      isExists: () => false
    });
    expect(spec).toEqual({ file: 'tsx', args: ['src/main.ts'], shell: false });
  });

  it('(d) win32 bare name → shell:true with winQuote-joined cmdline', () => {
    expect(
      resolveSpawn('tsx', [], 'app.ts', [], { platform: 'win32', isExists: () => false })
    ).toEqual({
      file: 'tsx app.ts',
      args: [],
      shell: true
    });
    // a spaced token is winQuote'd, not split
    expect(
      resolveSpawn('tsx', [], 'my app.ts', [], { platform: 'win32', isExists: () => false })
    ).toEqual({
      file: 'tsx "my app.ts"',
      args: [],
      shell: true
    });
  });

  it('(e) win32 "npm run dev" routes through cmd.exe (shell:true, single cmdline, no argv array)', () => {
    const spec: SpawnSpec = resolveSpawn('npm run dev', [], undefined, ['--silent'], {
      platform: 'win32',
      isExists: () => false
    });
    expect(spec).toEqual({ file: 'npm run dev --silent', args: [], shell: true });
  });

  it('(f) win32 .cmd path → shell:true', () => {
    expect(
      resolveSpawn(String.raw`C:\x\y.cmd a`, [], undefined, [], {
        platform: 'win32',
        isExists: () => false
      })
    ).toEqual({
      file: String.raw`C:\x\y.cmd a`,
      args: [],
      shell: true
    });
  });

  it('(g) win32 unquoted spaced .exe path merges CreateProcess-style via the injectable isExists probe', () => {
    const isExists = (p: string): boolean => p === String.raw`C:\Program Files\nodejs\node.exe`;
    const spec: SpawnSpec = resolveSpawn(
      String.raw`C:\Program Files\nodejs\node.exe app.js`,
      [],
      undefined,
      [],
      {
        platform: 'win32',
        isExists
      }
    );
    expect(spec).toEqual({
      file: String.raw`C:\Program Files\nodejs\node.exe`,
      args: ['app.js'],
      shell: false
    });
  });

  it('(g2) win32 .exe path without spaces spawns directly (no shell)', () => {
    const spec: SpawnSpec = resolveSpawn(String.raw`C:\tools\app.exe serve`, [], undefined, [], {
      platform: 'win32',
      isExists: () => false
    });
    expect(spec).toEqual({ file: String.raw`C:\tools\app.exe`, args: ['serve'], shell: false });
  });

  it('(h) POSIX quoted spaced path spawns directly, no merge needed', () => {
    const spec: SpawnSpec = resolveSpawn('"/opt/my tools/app" --serve', [], 'index.js', [], {
      platform: 'linux',
      isExists: isPosixFixture
    });
    expect(spec).toEqual({
      file: '/opt/my tools/app',
      args: ['--serve', 'index.js'],
      shell: false
    });
  });

  it('(i) orders args as [nodeArgs..., script, scriptArgs...]', () => {
    const viaNode = resolveSpawn('node', ['--inspect'], 'app.js', ['--port', '3000'], {
      platform: 'linux'
    });
    expect(viaNode.args).toEqual(['--inspect', 'app.js', '--port', '3000']);
    const viaTsx = resolveSpawn('tsx', ['--log'], 'src/main.ts', ['--watch'], {
      platform: 'linux',
      isExists: () => false
    });
    expect(viaTsx.args).toEqual(['--log', 'src/main.ts', '--watch']);
  });
});

describe('isExecutableFile', () => {
  const directories: string[] = [];
  const makeDirection = (): string => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nodeloop-cmd-'));
    directories.push(direction);
    return direction;
  };

  afterEach(() => {
    for (const direction of directories.splice(0)) {
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });

  it('accepts a real file, rejects a directory and a missing path', () => {
    const direction = makeDirection();
    const file = path.join(direction, 'run.js');
    fs.writeFileSync(file, 'console.log(1)\n');
    expect(isExecutableFile(file)).toBe(true);
    expect(isExecutableFile(direction)).toBe(false);
    expect(isExecutableFile(path.join(direction, 'nope.js'))).toBe(false);
  });
});
