import { describe, it, expect } from 'vitest';
import { execOption } from '../../../src/cli/options/exec.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';

describe('execOption.merge', () => {
  it('CLI value REPLACES config.exec', () => {
    expect(execOption.merge('tsx', { exec: 'node' })).toBe('tsx');
  });

  it('undefined falls through to config.exec', () => {
    expect(execOption.merge(undefined, { exec: 'npm run dev' })).toBe('npm run dev');
  });

  it('empty CLI value falls through to config.exec', () => {
    expect(execOption.merge('', { exec: 'npm run dev' })).toBe('npm run dev');
  });

  it('returns undefined when neither CLI nor config provided a value', () => {
    expect(execOption.merge(undefined, {})).toBeUndefined();
  });
});

describe('exec parser integration', () => {
  it("'-x tsx' captures 'tsx'", () => {
    expect(parseInvocation(['-x', 'tsx']).values.exec).toBe('tsx');
  });

  it('\'--exec="npm run dev"\' keeps the quoted value as ONE raw token value', () => {
    // The shell strips the outer quotes; the parser receives a single argv
    // token `--exec="npm run dev"` and stores the value verbatim — quote
    // tokenization is the runtime layer's job (resolveSpawn), not the parser's.
    const parsed = parseInvocation(['--exec="npm run dev"']);
    expect(parsed.values.exec).toBe('"npm run dev"');
    expect(parsed.scriptToken).toBeNull();
  });

  it("'--exec npm run dev' (separate tokens) captures 'npm run dev'", () => {
    expect(parseInvocation(['--exec', 'npm run dev']).values.exec).toBe('npm run dev');
  });
});
