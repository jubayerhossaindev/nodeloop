import { describe, expect, it } from 'vitest';
import { DEFAULT_RESTART_WORDS, restartMatcher } from '../../../src/interactive/restart-command.js';

describe('restartMatcher', () => {
  const match = restartMatcher('rs');

  it("matches 'rs' followed by a newline", () => {
    expect(match('rs\n')).toBe(true);
  });

  it('matches surrounding whitespace and CRLF (trimmed semantics)', () => {
    expect(match('  rs  \r\n')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(match('RS')).toBe(true);
  });

  it("does NOT fire for 'rslash'", () => {
    expect(match('rslash')).toBe(false);
  });

  it("does NOT fire for 'rs extra'", () => {
    expect(match('rs extra')).toBe(false);
  });

  it('does NOT fire for the empty line', () => {
    expect(match('')).toBe(false);
  });

  it('accepts the bare word without a trailing newline', () => {
    expect(match('rs')).toBe(true);
  });

  it('DEFAULT_RESTART_WORDS are [rs, restart] and both match', () => {
    expect([...DEFAULT_RESTART_WORDS]).toEqual(['rs', 'restart']);
    const m = restartMatcher(DEFAULT_RESTART_WORDS);
    expect(m('rs\n')).toBe(true);
    expect(m('restart\r\n')).toBe(true);
    expect(m('reboot\n')).toBe(false);
  });

  it('accepts a word list', () => {
    const m = restartMatcher(['go', 'run']);
    expect(m('go\n')).toBe(true);
    expect(m('run\n')).toBe(true);
    expect(m('rs\n')).toBe(false);
  });

  it('escapes regex special characters in the word', () => {
    const m = restartMatcher('r.s');
    expect(m('r.s\n')).toBe(true);
    expect(m('rxs\n')).toBe(false);
  });
});
