import { describe, expect, it } from 'vitest';
import { detectColor, detectColorLevel, detectUnicode } from '../../../src/terminal/detection.js';

const TTY = { isTTY: true };
const PIPE = { isTTY: false };
const LINUX = 'linux';

describe('detectColorLevel — FORCE_COLOR', () => {
  it("'0' and 'false' disable color even on a TTY", () => {
    expect(detectColorLevel(TTY, { FORCE_COLOR: '0' }, LINUX)).toBe(0);
    expect(detectColorLevel(TTY, { FORCE_COLOR: 'false' }, LINUX)).toBe(0);
  });

  it("'1' and 'true' force level 1 even piped", () => {
    expect(detectColorLevel(PIPE, { FORCE_COLOR: '1' }, LINUX)).toBe(1);
    expect(detectColorLevel(PIPE, { FORCE_COLOR: 'true' }, LINUX)).toBe(1);
  });

  it("'2' forces level 2 even piped", () => {
    expect(detectColorLevel(PIPE, { FORCE_COLOR: '2' }, LINUX)).toBe(2);
  });

  it("'3' (and any other truthy value) forces level 3 even piped", () => {
    expect(detectColorLevel(PIPE, { FORCE_COLOR: '3' }, LINUX)).toBe(3);
    expect(detectColorLevel(PIPE, { FORCE_COLOR: '4' }, LINUX)).toBe(3);
  });

  it('FORCE_COLOR beats NO_COLOR (chalk/supports-color precedence)', () => {
    expect(detectColorLevel(TTY, { FORCE_COLOR: '1', NO_COLOR: '1' }, LINUX)).toBe(1);
  });
});

describe('detectColorLevel — NO_COLOR', () => {
  it('a non-empty NO_COLOR disables color regardless of TTY', () => {
    expect(detectColorLevel(TTY, { NO_COLOR: '1' }, LINUX)).toBe(0);
    expect(detectColorLevel(TTY, { NO_COLOR: '0' }, LINUX)).toBe(0);
  });

  it('an EMPTY-string NO_COLOR is ignored', () => {
    expect(detectColorLevel(TTY, { NO_COLOR: '' }, LINUX)).toBe(1);
  });
});

describe('detectColorLevel — TTY and TERM', () => {
  it('no TTY → 0 (stream and missing stream)', () => {
    expect(detectColorLevel(PIPE, {}, LINUX)).toBe(0);
    expect(detectColorLevel(undefined, {}, LINUX)).toBe(0);
  });

  it('TERM=dumb → 0', () => {
    expect(detectColorLevel(TTY, { TERM: 'dumb' }, LINUX)).toBe(0);
  });

  it('a plain TTY → level 1', () => {
    expect(detectColorLevel(TTY, {}, LINUX)).toBe(1);
  });

  it('CI → level 1', () => {
    expect(detectColorLevel(TTY, { CI: '1' }, LINUX)).toBe(1);
  });
});

describe('detectColorLevel — truecolor signals', () => {
  it('COLORTERM truecolor/24bit → 3', () => {
    expect(detectColorLevel(TTY, { COLORTERM: 'truecolor' }, LINUX)).toBe(3);
    expect(detectColorLevel(TTY, { COLORTERM: '24bit' }, LINUX)).toBe(3);
  });

  it('WT_SESSION (Windows Terminal) → 3', () => {
    expect(detectColorLevel(TTY, { WT_SESSION: 'some-guid' }, LINUX)).toBe(3);
  });
});

describe('detectColorLevel — TERM_PROGRAM', () => {
  const programs = ['vscode', 'WezTerm', 'ghostty', 'iTerm.app'];

  it('known TERM_PROGRAMs without COLORTERM → 2 (256-color)', () => {
    for (const program of programs) {
      expect(detectColorLevel(TTY, { TERM_PROGRAM: program }, LINUX)).toBe(2);
    }
  });

  it('known TERM_PROGRAMs with COLORTERM → 3 (truecolor)', () => {
    for (const program of programs) {
      expect(detectColorLevel(TTY, { TERM_PROGRAM: program, COLORTERM: 'truecolor' }, LINUX)).toBe(
        3
      );
    }
  });
});

describe('detectColorLevel — platform and TERM', () => {
  it('platform win32 → 2 (libuv enables VT processing)', () => {
    expect(detectColorLevel(TTY, {}, 'win32')).toBe(2);
  });

  it('TERM mentioning 256color → 2', () => {
    expect(detectColorLevel(TTY, { TERM: 'xterm-256color' }, LINUX)).toBe(2);
  });
});

describe('detectColor', () => {
  it('is true exactly when the level is > 0', () => {
    expect(detectColor(TTY, {}, LINUX)).toBe(true);
    expect(detectColor(PIPE, {}, LINUX)).toBe(false);
    expect(detectColor(TTY, { NO_COLOR: '1' }, LINUX)).toBe(false);
  });
});

describe('detectUnicode', () => {
  it('NODELOOP_ASCII=1 forces ASCII even on a TTY', () => {
    expect(detectUnicode(TTY, { NODELOOP_ASCII: '1' })).toBe(false);
  });

  it('NODELOOP_ASCII=0 is ignored — unicode on a TTY', () => {
    expect(detectUnicode(TTY, { NODELOOP_ASCII: '0' })).toBe(true);
  });

  it('no TTY → false (piped output)', () => {
    expect(detectUnicode(PIPE, {})).toBe(false);
    expect(detectUnicode(undefined, {})).toBe(false);
  });

  it('TERM=dumb → false', () => {
    expect(detectUnicode(TTY, { TERM: 'dumb' })).toBe(false);
  });

  it('a plain TTY → true', () => {
    expect(detectUnicode(TTY, {})).toBe(true);
  });
});
