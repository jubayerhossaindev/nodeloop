import { describe, it, expect } from 'vitest';
import { ignoreOption } from '../../../src/cli/options/ignore.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';
import type { NormalizedConfig } from '../../../src/config/schema.js';

describe('ignoreOption.merge', () => {
  it('EXTENDS the config list: config entries first, then CLI entries', () => {
    const config = { ignore: ['node_modules', '.git'] } as NormalizedConfig;
    expect(ignoreOption.merge('uploads,logs', config)).toEqual([
      'node_modules',
      '.git',
      'uploads',
      'logs'
    ]);
  });

  it('splits CLI on commas, trims entries and drops blanks', () => {
    expect(ignoreOption.merge(' a , , b ,,c', {})).toEqual(['a', 'b', 'c']);
  });

  it('empty CLI value adds nothing (config list passes through)', () => {
    const config = { ignore: ['dist'] } as NormalizedConfig;
    expect(ignoreOption.merge('', config)).toEqual(['dist']);
    expect(ignoreOption.merge(undefined, config)).toEqual(['dist']);
  });

  it('no CLI and no config yields an empty array', () => {
    expect(ignoreOption.merge(undefined, {})).toEqual([]);
  });
});

describe('ignore parser integration', () => {
  it("'-i uploads,logs' captures the raw comma string", () => {
    const parsed = parseInvocation(['-i', 'uploads,logs']);
    expect(parsed.values.ignore).toBe('uploads,logs');
  });

  it("'--ignore=uploads,logs' (= syntax) captures the same raw string", () => {
    expect(parseInvocation(['--ignore=uploads,logs']).values.ignore).toBe('uploads,logs');
  });
});
