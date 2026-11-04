import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  normalizeExts as normalizeExtensions,
  normalizeIgnores,
  normalizePollInterval,
  normalizeWatchPaths,
  positive
} from '../../../src/runtime/normalize.js';

const directories: string[] = [];
const makeDirection = (): string => {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nodeloop-normalize-'));
  directories.push(direction);
  return direction;
};

afterAll(() => {
  for (const direction of directories.splice(0)) {
    fs.rmSync(direction, { recursive: true, force: true });
  }
});

describe('positive', () => {
  it('accepts numeric strings and numbers', () => {
    expect(positive('300', 100)).toBe(300);
    expect(positive(300, 100)).toBe(300);
  });

  it('falls back on zero, negatives, garbage and undefined', () => {
    expect(positive(0, 100)).toBe(100);
    expect(positive(-5, 100)).toBe(100);
    expect(positive('abc', 100)).toBe(100);
    expect(positive(undefined, 100)).toBe(100);
    expect(positive(undefined, 100)).toBe(100);
  });
});

describe('normalizePollInterval', () => {
  it('legacyWatch:true → 1000ms', () => {
    expect(normalizePollInterval(true)).toBe(1000);
  });

  it('a number ≥ 50 passes through', () => {
    expect(normalizePollInterval(50)).toBe(50);
    expect(normalizePollInterval(250)).toBe(250);
  });

  it('anything else → 0 (fs.watch events)', () => {
    expect(normalizePollInterval(49)).toBe(0);
    expect(normalizePollInterval(false)).toBe(0);
    expect(normalizePollInterval(undefined)).toBe(0);
    expect(normalizePollInterval('x' as unknown as boolean)).toBe(0);
  });
});

describe('normalizeExts', () => {
  it('splits a comma string', () => {
    expect(normalizeExtensions('js,mjs')).toEqual(['js', 'mjs']);
  });

  it('strips a leading dot and lowercases', () => {
    expect(normalizeExtensions('.JS')).toEqual(['js']);
  });

  it('accepts arrays and normalizes each entry', () => {
    expect(normalizeExtensions(['js', ' TS ', '.cjs'])).toEqual(['js', 'ts', 'cjs']);
  });

  it('drops blank entries and returns [] for undefined', () => {
    expect(normalizeExtensions('js, , mjs,')).toEqual(['js', 'mjs']);
    expect(normalizeExtensions(undefined)).toEqual([]);
  });
});

describe('normalizeIgnores', () => {
  it('PRESERVES the leading dot (.git stays .git) in both set and display', () => {
    const { set, display } = normalizeIgnores(['.git']);
    expect(display).toEqual(['.git']);
    expect(set.has('.git')).toBe(true);
  });

  it('display keeps the original spelling, the set lowercases for matching', () => {
    const { set, display } = normalizeIgnores(['.DS_Store']);
    expect(display).toEqual(['.DS_Store']);
    expect(set.has('.ds_store')).toBe(true);
    expect(set.has('.DS_Store')).toBe(false);
  });

  it('dedupes case-insensitively, keeping the FIRST spelling for display', () => {
    const { set, display } = normalizeIgnores(['Node_modules', 'node_modules', 'NODE_MODULES']);
    expect(display).toEqual(['Node_modules']);
    expect(set.size).toBe(1);
    expect(set.has('node_modules')).toBe(true);
  });

  it('drops blank entries', () => {
    const { set, display } = normalizeIgnores(['coverage', '  ', '']);
    expect(display).toEqual(['coverage']);
    expect(set.size).toBe(1);
  });
});

describe('normalizeWatchPaths', () => {
  it('undefined → []', () => {
    expect(normalizeWatchPaths(undefined, process.cwd())).toEqual([]);
  });

  it('makes absolute paths relative to cwd', () => {
    const cwd = makeDirection();
    expect(normalizeWatchPaths([path.join(cwd, 'src')], cwd)).toEqual(['src']);
  });

  it("trims './' prefixes and trailing slashes", () => {
    const cwd = makeDirection();
    expect(normalizeWatchPaths(['./src/'], cwd)).toEqual(['src']);
  });

  it('normalizes backslashes to forward slashes', () => {
    const cwd = makeDirection();
    expect(normalizeWatchPaths([String.raw`src\lib`], cwd)).toEqual(['src/lib']);
  });

  it('dedupes after normalization', () => {
    const cwd = makeDirection();
    expect(normalizeWatchPaths(['src', 'src/', './src'], cwd)).toEqual(['src']);
  });

  it('splits comma strings and trims blanks', () => {
    const cwd = makeDirection();
    expect(normalizeWatchPaths('src, lib', cwd)).toEqual(['src', 'lib']);
  });
});
