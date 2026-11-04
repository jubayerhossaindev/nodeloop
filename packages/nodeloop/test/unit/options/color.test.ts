import { describe, it, expect } from 'vitest';
import { resolveColorFlag } from '../../../src/cli/options/color.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';

describe('resolveColorFlag', () => {
  it("['--color'] → true", () => {
    expect(resolveColorFlag(['--color'])).toBe(true);
  });

  it("['--no-color'] → false", () => {
    expect(resolveColorFlag(['--no-color'])).toBe(false);
  });

  it('neither flag → undefined (auto)', () => {
    expect(resolveColorFlag(['-e', 'js', 'app.js'])).toBeUndefined();
    expect(resolveColorFlag([])).toBeUndefined();
  });

  it('BOTH given → --color wins (true), regardless of order', () => {
    expect(resolveColorFlag(['--no-color', '--color'])).toBe(true);
    expect(resolveColorFlag(['--color', '--no-color'])).toBe(true);
  });

  it('QUIRK: a --color AFTER the script / after `--` still counts (raw argv check)', () => {
    expect(resolveColorFlag(['app.js', '--', '--color'])).toBe(true);
    expect(resolveColorFlag(['app.js', '--color'])).toBe(true);
    expect(resolveColorFlag(['app.js', '--', '--no-color'])).toBe(false);
  });
});

describe('color parser integration', () => {
  it('parseInvocation surfaces the quirk: app-arg --color sets values.color = true', () => {
    const parsed = parseInvocation(['app.js', '--', '--color']);
    expect(parsed.scriptToken).toBe('app.js');
    expect(parsed.afterScript).toEqual(['--color']);
    expect(parsed.values.color).toBe(true);
  });

  it('parseInvocation: --no-color before the script → values.color = false', () => {
    expect(parseInvocation(['--no-color', 'app.js']).values.color).toBe(false);
  });

  it('parseInvocation: no color flag → values.color = undefined', () => {
    expect(parseInvocation(['app.js']).values.color).toBeUndefined();
  });
});
