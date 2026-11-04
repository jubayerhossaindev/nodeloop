import { describe, it, expect } from 'vitest';
import { maxWaitOption } from '../../../src/cli/options/max-wait.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';

describe('maxWaitOption.merge', () => {
  it('returns the CLI string verbatim when present (replaces config)', () => {
    expect(maxWaitOption.merge('1000', { maxWait: 500 })).toBe('1000');
  });

  it('returns the config number when CLI is undefined', () => {
    expect(maxWaitOption.merge(undefined, { maxWait: 500 })).toBe(500);
  });

  it('empty CLI value falls through to the config number', () => {
    expect(maxWaitOption.merge('', { maxWait: 500 })).toBe(500);
  });

  it('returns undefined when neither CLI nor config provided a value', () => {
    expect(maxWaitOption.merge(undefined, {})).toBeUndefined();
  });
});

describe('max-wait parser integration', () => {
  it("'-m 1000' captures the raw string '1000'", () => {
    const parsed = parseInvocation(['-m', '1000']);
    expect(parsed.values['max-wait']).toBe('1000');
  });

  it("'--max-wait=1000' (= syntax) captures the raw string '1000'", () => {
    expect(parseInvocation(['--max-wait=1000']).values['max-wait']).toBe('1000');
  });
});
