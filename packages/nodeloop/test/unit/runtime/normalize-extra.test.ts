/**
normalizeWatchPaths — absolute watch-scope input.
*/
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  normalizeWatchPaths,
  normalizeExts as normalizeExtensions
} from '../../../src/runtime/normalize.js';

describe('normalizeWatchPaths — absolute scopes', () => {
  it('absolute paths are made cwd-relative', () => {
    const abs = path.resolve('/tmp/proj', 'src/lib');
    expect(normalizeWatchPaths([abs], '/tmp/proj')).toEqual(['src/lib']);
  });

  it('relative scopes keep normalization: ./x/ → x, backslashes → slashes, dedup', () => {
    expect(normalizeWatchPaths(['./src/', 'src', String.raw`lib\x`], '/p')).toEqual([
      'src',
      'lib/x'
    ]);
  });

  it('blank entries are dropped', () => {
    expect(normalizeWatchPaths(['', ' '.repeat(3)], '/p')).toEqual([]);
  });

  it('normalizeExts deduplicates via trim/lowercase/dot-strip', () => {
    expect(normalizeExtensions('.JS, ts , ')).toEqual(['js', 'ts']);
  });
});
