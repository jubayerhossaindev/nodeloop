import { describe, expect, it } from 'vitest';
import { SYM_ASCII, SYM_UNICODE, getSymbols } from '../../../src/terminal/icons.js';

describe('SYM_UNICODE', () => {
  it('carries the exact documented glyphs', () => {
    expect({ ...SYM_UNICODE }).toEqual({
      watch: '●',
      play: '▶',
      restart: '↻',
      ok: '✓',
      fail: '✕',
      stop: '■',
      warn: '⚠',
      tip: '→',
      mid: '·',
      dash: '—'
    });
  });
});

describe('SYM_ASCII', () => {
  it('carries the exact ASCII fallbacks', () => {
    expect({ ...SYM_ASCII }).toEqual({
      watch: 'o',
      play: '>',
      restart: '>',
      ok: '+',
      fail: 'x',
      stop: '-',
      warn: '!',
      tip: '->',
      mid: '-',
      dash: '-'
    });
  });
});

describe('getSymbols', () => {
  it('returns the unicode set for true', () => {
    expect(getSymbols(true)).toBe(SYM_UNICODE);
    expect(getSymbols(true).play).toBe('▶');
  });

  it('returns the ASCII set for false', () => {
    expect(getSymbols(false)).toBe(SYM_ASCII);
    expect(getSymbols(false).play).toBe('>');
  });
});
