import { describe, it, expect } from 'vitest';
import { isHelpRequested, HELP_FLAGS } from '../../../src/cli/options/help.js';

describe('isHelpRequested', () => {
  it("'-h' anywhere → true", () => {
    expect(isHelpRequested(['-h'])).toBe(true);
    expect(isHelpRequested(['app.js', '-h'])).toBe(true);
  });

  it("'--help' anywhere → true", () => {
    expect(isHelpRequested(['--help'])).toBe(true);
    expect(isHelpRequested(['app.js', '--help'])).toBe(true);
  });

  it('neither flag → false', () => {
    expect(isHelpRequested(['app.js'])).toBe(false);
    expect(isHelpRequested(['-e', 'js'])).toBe(false);
    expect(isHelpRequested([])).toBe(false);
  });

  it('both flags → true', () => {
    expect(isHelpRequested(['-h', '--help'])).toBe(true);
  });
});

describe('HELP_FLAGS', () => {
  it('is exactly the pair [-h, --help]', () => {
    expect(HELP_FLAGS).toEqual(['-h', '--help']);
  });
});
