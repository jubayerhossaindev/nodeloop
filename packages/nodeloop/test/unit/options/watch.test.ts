import { describe, it, expect } from 'vitest';
import { watchOption } from '../../../src/cli/options/watch.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';
import type { NormalizedConfig } from '../../../src/config/schema.js';

describe('watchOption.merge', () => {
  it('CLI value REPLACES the config watch value', () => {
    expect(watchOption.merge('packages/api', { watch: 'src' })).toBe('packages/api');
  });

  it('undefined falls through to the config value', () => {
    expect(watchOption.merge(undefined, { watch: 'src' })).toBe('src');
  });

  it('empty CLI value falls through to the config value', () => {
    expect(watchOption.merge('', { watch: 'src' })).toBe('src');
  });

  it('a string config.watch passes through raw (legacy cli.js:177: watchFlag || config.watch)', () => {
    const config = { watch: 'src' } as NormalizedConfig;
    expect(watchOption.merge(undefined, config)).toBe('src');
  });

  it('an array config.watch passes through raw — the runtime layer normalizes it (lib/config.js:208 parity)', () => {
    const config = { watch: ['src', 'lib'] } as NormalizedConfig;
    expect(watchOption.merge(undefined, config)).toEqual(['src', 'lib']);
  });

  it('an EMPTY array config.watch falls through to undefined (legacy: || drops it)', () => {
    const config = { watch: [] } as unknown as NormalizedConfig;
    expect(watchOption.merge(undefined, config)).toBeUndefined();
  });

  it('CLI wins over an array config.watch', () => {
    const config = { watch: ['src'] } as NormalizedConfig;
    expect(watchOption.merge('lib', config)).toBe('lib');
  });

  it('neither CLI nor config yields undefined', () => {
    expect(watchOption.merge(undefined, {})).toBeUndefined();
  });
});

describe('watch parser integration', () => {
  it("'-w packages/api' captures the raw value", () => {
    const parsed = parseInvocation(['-w', 'packages/api']);
    expect(parsed.values.watch).toBe('packages/api');
  });

  it("'--watch=packages/api' (= syntax) captures the same value", () => {
    expect(parseInvocation(['--watch=packages/api']).values.watch).toBe('packages/api');
  });
});
