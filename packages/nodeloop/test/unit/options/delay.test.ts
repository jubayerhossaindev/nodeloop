import { describe, it, expect } from 'vitest';
import { delayOption } from '../../../src/cli/options/delay.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';

describe('delayOption.merge', () => {
  it('returns the CLI string verbatim when present', () => {
    expect(delayOption.merge('500', { delay: 200 })).toBe('500');
  });

  it('returns the config number when CLI is undefined', () => {
    expect(delayOption.merge(undefined, { delay: 200 })).toBe(200);
  });

  it('empty CLI value falls through to the config number', () => {
    expect(delayOption.merge('', { delay: 200 })).toBe(200);
  });

  it('returns undefined when neither CLI nor config provided a value', () => {
    expect(delayOption.merge(undefined, {})).toBeUndefined();
  });
});

describe('delay parser integration', () => {
  it("'-d 500' captures the raw string '500'", () => {
    const parsed = parseInvocation(['-d', '500']);
    expect(parsed.values.delay).toBe('500');
  });

  it("'--delay=500' (= syntax) captures the raw string '500'", () => {
    expect(parseInvocation(['--delay=500']).values.delay).toBe('500');
  });
});
