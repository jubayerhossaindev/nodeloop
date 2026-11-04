import { describe, it, expect } from 'vitest';
import { SEPARATOR, dropLeadingSeparator } from '../../../src/cli/options/separator.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';

describe('dropLeadingSeparator', () => {
  it("['--', 'x'] → ['x'] (one leading separator dropped)", () => {
    expect(dropLeadingSeparator(['--', 'x'])).toEqual(['x']);
  });

  it("['x'] → ['x'] (no separator, unchanged)", () => {
    expect(dropLeadingSeparator(['x'])).toEqual(['x']);
  });

  it('[] → []', () => {
    expect(dropLeadingSeparator([])).toEqual([]);
  });

  it("['--'] → []", () => {
    expect(dropLeadingSeparator(['--'])).toEqual([]);
  });

  it('SEPARATOR constant is the literal "--"', () => {
    expect(SEPARATOR).toBe('--');
  });
});

describe('parseInvocation separator handling', () => {
  it("['--', '--x', 'app.js'] → the NEXT token is forced to be the script", () => {
    const parsed = parseInvocation(['--', '--x', 'app.js']);
    expect(parsed.scriptToken).toBe('--x');
    expect(parsed.afterScript).toEqual(['app.js']);
  });

  it("['app.js', '--', '--config'] → separator after script is CONSUMED, not an app arg", () => {
    const parsed = parseInvocation(['app.js', '--', '--config']);
    expect(parsed.scriptToken).toBe('app.js');
    expect(parsed.afterScript).toEqual(['--config']);
  });

  it("['app.js', '--', '--', 'y'] → only ONE leading separator is dropped", () => {
    const parsed = parseInvocation(['app.js', '--', '--', 'y']);
    expect(parsed.scriptToken).toBe('app.js');
    expect(parsed.afterScript).toEqual(['--', 'y']);
  });

  it("['--'] alone → scriptToken null", () => {
    const parsed = parseInvocation(['--']);
    expect(parsed.scriptToken).toBeNull();
    expect(parsed.afterScript).toEqual([]);
  });
});
