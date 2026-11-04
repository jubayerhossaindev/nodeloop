import { describe, expect, it } from 'vitest';
import { restartWord, shouldInterceptStdin } from '../../../src/interactive/terminal-handoff.js';

describe('shouldInterceptStdin', () => {
  it('intercepts on a TTY with default settings', () => {
    expect(shouldInterceptStdin({ isTTY: true, env: {}, restartable: undefined })).toBe(true);
  });

  it('never intercepts a non-TTY stdin', () => {
    expect(shouldInterceptStdin({ isTTY: false, env: {}, restartable: undefined })).toBe(false);
  });

  it("NODELOOP_NO_RS='1' opts out (documented escape hatch)", () => {
    expect(
      shouldInterceptStdin({ isTTY: true, env: { NODELOOP_NO_RS: '1' }, restartable: undefined })
    ).toBe(false);
  });

  it('restartable:false hands the terminal to the app', () => {
    expect(shouldInterceptStdin({ isTTY: true, env: {}, restartable: false })).toBe(false);
  });

  it('a custom restart word still intercepts', () => {
    expect(shouldInterceptStdin({ isTTY: true, env: {}, restartable: 'go' })).toBe(true);
  });

  it('falls back to process.env when env is undefined', () => {
    const saved = process.env.NODELOOP_NO_RS;
    delete process.env.NODELOOP_NO_RS;
    try {
      expect(shouldInterceptStdin({ isTTY: true, restartable: undefined })).toBe(true);
      process.env.NODELOOP_NO_RS = '1';
      expect(shouldInterceptStdin({ isTTY: true, restartable: undefined })).toBe(false);
    } finally {
      if (saved === undefined) {
        delete process.env.NODELOOP_NO_RS;
      } else {
        process.env.NODELOOP_NO_RS = saved;
      }
    }
  });
});

describe('restartWord', () => {
  it("defaults to 'rs'", () => {
    expect(restartWord(undefined)).toBe('rs');
  });

  it("uses the configured word ('go' → 'go')", () => {
    expect(restartWord('go')).toBe('go');
  });

  it("false falls back to 'rs' (shouldInterceptStdin already excluded it)", () => {
    expect(restartWord(false)).toBe('rs');
  });
});
