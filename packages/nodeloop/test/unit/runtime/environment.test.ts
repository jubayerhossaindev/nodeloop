import { describe, expect, it } from 'vitest';
import { buildEnv as buildEnvironment } from '../../../src/runtime/environment.js';

describe('buildEnv', () => {
  it('merges config env over the base env', () => {
    expect(buildEnvironment({ B: '2' }, { A: '1' })).toEqual({ A: '1', B: '2' });
  });

  it('config keys override base keys, everything else inherited untouched', () => {
    expect(buildEnvironment({ A: 'override' }, { A: '1', B: 'keep' })).toEqual({
      A: 'override',
      B: 'keep'
    });
  });

  it('only spreads — values arrive already stringified by the loader (exact object)', () => {
    const environment = buildEnvironment({ PORT: '3000', DEBUG: 'true' }, {});
    expect(environment).toEqual({ PORT: '3000', DEBUG: 'true' });
  });

  it('undefined config returns a COPY of base, not the same reference', () => {
    const base = { A: '1' };
    const environment = buildEnvironment(undefined, base);
    expect(environment).toEqual({ A: '1' });
    expect(environment).not.toBe(base);
    environment.A = 'mutated';
    expect(base.A).toBe('1');
  });
});
