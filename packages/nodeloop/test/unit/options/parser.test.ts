import { describe, it, expect } from 'vitest';
import {
  parseInvocation,
  isValueFlag,
  isBoolFlag,
  LONG_VALUE_FLAGS,
  SHORT_VALUE_FLAGS
} from '../../../src/cli/options/parser.js';

describe('parseInvocation — value flags', () => {
  it("a value flag at end-of-argv captures '' (e.g. ['-e'] → ext='')", () => {
    const parsed = parseInvocation(['-e']);
    expect(parsed.values.ext).toBe('');
    expect(parsed.scriptToken).toBeNull();
    expect(parsed.afterScript).toEqual([]);
  });

  it('duplicate value flags: FIRST occurrence wins', () => {
    const parsed = parseInvocation(['-e', 'a', '--ext', 'b']);
    expect(parsed.values.ext).toBe('a');
  });

  it("long flag with '=' syntax: ['--ext=js,json', 'app.js'] → ext='js,json', script found", () => {
    const parsed = parseInvocation(['--ext=js,json', 'app.js']);
    expect(parsed.values.ext).toBe('js,json');
    expect(parsed.scriptToken).toBe('app.js');
    expect(parsed.afterScript).toEqual([]);
  });

  it("long flag with '=' and EMPTY value: ['--ext='] → ext=''", () => {
    expect(parseInvocation(['--ext=']).values.ext).toBe('');
  });

  it('long-only value flags take two tokens: --node-args / --config', () => {
    expect(parseInvocation(['--node-args', '--inspect', 'app.js']).values['node-args']).toBe(
      '--inspect'
    );
    expect(parseInvocation(['--config', 'c.json', 'app.js']).values.config).toBe('c.json');
  });
});

describe('parseInvocation — boolean flags', () => {
  it('bool flags are consumed WITHOUT taking a value', () => {
    const parsed = parseInvocation(['--verbose', '-q', 'app.js']);
    expect(parsed.values.verbose).toBe(true);
    expect(parsed.values.quiet).toBe(true);
    expect(parsed.scriptToken).toBe('app.js');
    expect(parsed.afterScript).toEqual([]);
  });

  it('a bool flag does not swallow the following token as a value', () => {
    expect(parseInvocation(['-v', 'app.js']).scriptToken).toBe('app.js');
  });
});

describe('parseInvocation — script and app args', () => {
  it('an unknown token becomes the script', () => {
    const parsed = parseInvocation(['foo.js']);
    expect(parsed.scriptToken).toBe('foo.js');
    expect(parsed.afterScript).toEqual([]);
  });

  it('everything after the script is verbatim: app args are untouched', () => {
    const parsed = parseInvocation(['-e', 'js', 'app.js', '--port', '3000']);
    expect(parsed.values.ext).toBe('js');
    expect(parsed.scriptToken).toBe('app.js');
    expect(parsed.afterScript).toEqual(['--port', '3000']);
  });

  it('runner flags AFTER the script belong to the app, not the runner', () => {
    const parsed = parseInvocation(['app.js', '--verbose', '-e', 'ts']);
    expect(parsed.scriptToken).toBe('app.js');
    expect(parsed.afterScript).toEqual(['--verbose', '-e', 'ts']);
    expect(parsed.values.verbose).toBe(false);
    expect(parsed.values.ext).toBeUndefined();
  });
});

describe('flag classification helpers', () => {
  it('isValueFlag: true for long and short value flags, false for bool flags', () => {
    expect(isValueFlag('--ext')).toBe(true);
    expect(isValueFlag('-e')).toBe(true);
    expect(isValueFlag('--node-args')).toBe(true);
    expect(isValueFlag('--config')).toBe(true);
    expect(isValueFlag('--verbose')).toBe(false);
    expect(isValueFlag('-v')).toBe(false);
  });

  it('isBoolFlag: true exactly for the boolean runner flags', () => {
    expect(isBoolFlag('-v')).toBe(true);
    expect(isBoolFlag('-V')).toBe(true);
    expect(isBoolFlag('--verbose')).toBe(true);
    expect(isBoolFlag('-q')).toBe(true);
    expect(isBoolFlag('--quiet')).toBe(true);
    expect(isBoolFlag('--color')).toBe(true);
    expect(isBoolFlag('--no-color')).toBe(true);
    expect(isBoolFlag('--ext')).toBe(false);
    expect(isBoolFlag('-e')).toBe(false);
  });

  it("'=' syntax is only valid on long value flags", () => {
    for (const flag of [
      '--ext',
      '--ignore',
      '--delay',
      '--max-wait',
      '--watch',
      '--exec',
      '--node-args',
      '--config'
    ]) {
      expect(LONG_VALUE_FLAGS.has(flag)).toBe(true);
    }
    for (const flag of ['-e', '-i', '-d', '-m', '-w', '-x']) {
      expect(SHORT_VALUE_FLAGS.has(flag)).toBe(true);
      expect(LONG_VALUE_FLAGS.has(flag)).toBe(false);
    }
  });
});
