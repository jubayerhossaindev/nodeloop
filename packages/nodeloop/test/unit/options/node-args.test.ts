import { describe, it, expect } from 'vitest';
import { nodeArgsOption as nodeArgumentsOption } from '../../../src/cli/options/node-args.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';
import { tokenizeCommand } from '../../../src/runtime/command.js';
import type { NormalizedConfig } from '../../../src/config/schema.js';

describe('nodeArgsOption.merge', () => {
  it('tokenizes the CLI string with tokenizeCommand', () => {
    expect(nodeArgumentsOption.merge('--inspect', {})).toEqual(['--inspect']);
    expect(nodeArgumentsOption.merge('--inspect --harmony', {})).toEqual([
      '--inspect',
      '--harmony'
    ]);
    expect(nodeArgumentsOption.merge('--inspect', {})).toEqual(tokenizeCommand('--inspect'));
  });

  it("splits a plain spaced value: '--eval 1' → ['--eval', '1']", () => {
    // After the shell strips quotes, `--node-args "--eval 1"` delivers the
    // single STRING '--eval 1'; tokenization then produces two argv tokens.
    expect(nodeArgumentsOption.merge('--eval 1', {})).toEqual(['--eval', '1']);
  });

  it('spaces inside QUOTED paths survive as one token', () => {
    expect(nodeArgumentsOption.merge(String.raw`"C:\Program Files\node\node.exe"`, {})).toEqual([
      String.raw`C:\Program Files\node\node.exe`
    ]);
    expect(nodeArgumentsOption.merge("'--eval 1 and 2'", {})).toEqual(['--eval 1 and 2']);
  });

  it('an array config.nodeArgs passes through untouched', () => {
    const config = { nodeArgs: ['--inspect', '--trace-warnings'] } as NormalizedConfig;
    expect(nodeArgumentsOption.merge(undefined, config)).toEqual(['--inspect', '--trace-warnings']);
  });

  it('no CLI and no config yields an empty array', () => {
    expect(nodeArgumentsOption.merge(undefined, {})).toEqual([]);
  });
});

describe('node-args parser integration', () => {
  it("'--node-args --inspect' captures the value string '--inspect'", () => {
    const parsed = parseInvocation(['--node-args', '--inspect']);
    expect(parsed.values['node-args']).toBe('--inspect');
    expect(parsed.scriptToken).toBeNull();
  });
});
