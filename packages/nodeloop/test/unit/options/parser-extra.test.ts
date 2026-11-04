/**
Parser coverage beyond the main suite: long-form bool flags and the
`=` syntax interplay.
*/
import { describe, it, expect } from 'vitest';
import { parseInvocation, isValueFlag, isBoolFlag } from '../../../src/cli/options/parser.js';

describe('parseInvocation — long bool flags', () => {
  it('--verbose and --quiet set their slots through the long-form lookup', () => {
    const parsed = parseInvocation(['--verbose', '--quiet', 'app.js']);
    expect(parsed.values.verbose).toBe(true);
    expect(parsed.values.quiet).toBe(true);
    expect(parsed.scriptToken).toBe('app.js');
  });

  it('unknown flag-like tokens fall through to the script slot', () => {
    const parsed = parseInvocation(['--definitely-not-a-flag', 'app.js']);
    expect(parsed.scriptToken).toBe('--definitely-not-a-flag');
  });

  it('isValueFlag/isBoolFlag classify correctly', () => {
    expect(isValueFlag('--ext')).toBe(true);
    expect(isValueFlag('-e')).toBe(true);
    expect(isValueFlag('--verbose')).toBe(false);
    expect(isBoolFlag('--verbose')).toBe(true);
    expect(isBoolFlag('--color')).toBe(true);
    expect(isBoolFlag('--ext')).toBe(false);
  });
});
