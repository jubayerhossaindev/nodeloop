/**
detectColorLevel — the TERM_PROGRAM branch with and without COLORTERM.
*/
import { describe, it, expect } from 'vitest';
import { detectColorLevel } from '../../../src/terminal/detection.js';

const TTY = { isTTY: true };

describe('detectColorLevel — TERM_PROGRAM', () => {
  it('vscode/WezTerm/ghostty/iTerm without COLORTERM still get 256 colors', () => {
    for (const tp of ['vscode', 'WezTerm', 'ghostty', 'iTerm.app']) {
      expect(detectColorLevel(TTY, { TERM_PROGRAM: tp }, 'linux')).toBe(2);
    }
  });

  it('COLORTERM upgrades them to truecolor', () => {
    expect(detectColorLevel(TTY, { TERM_PROGRAM: 'vscode', COLORTERM: 'truecolor' }, 'linux')).toBe(
      3
    );
    expect(detectColorLevel(TTY, { TERM_PROGRAM: 'iTerm.app', COLORTERM: '24bit' }, 'linux')).toBe(
      3
    );
  });

  it('a COLORTERM value that is neither truecolor nor 24bit still upgrades TERM_PROGRAM terminals', () => {
    // the generic ladder at the top returns 3 only for truecolor/24bit; the
    // TERM_PROGRAM branch has its own upgrade for any other COLORTERM value
    expect(detectColorLevel(TTY, { TERM_PROGRAM: 'ghostty', COLORTERM: 'yes' }, 'linux')).toBe(3);
  });

  it('unknown TERM_PROGRAM falls through to the generic ladder', () => {
    expect(detectColorLevel(TTY, { TERM_PROGRAM: 'tmux' }, 'linux')).toBe(1);
    expect(detectColorLevel(TTY, { TERM_PROGRAM: 'tmux', TERM: 'xterm-256color' }, 'linux')).toBe(
      2
    );
  });

  it('WT_SESSION and WT_PROFILE_ID mean truecolor', () => {
    expect(detectColorLevel(TTY, { WT_SESSION: '{guid}' }, 'win32')).toBe(3);
    expect(detectColorLevel(TTY, { WT_PROFILE_ID: '1' }, 'win32')).toBe(3);
  });

  it('plain win32 without the terminal markers gets 256 colors', () => {
    expect(detectColorLevel(TTY, {}, 'win32')).toBe(2);
  });

  it('CI without any terminal markers gets basic colors', () => {
    expect(detectColorLevel(TTY, { CI: '1' }, 'linux')).toBe(1);
  });
});
