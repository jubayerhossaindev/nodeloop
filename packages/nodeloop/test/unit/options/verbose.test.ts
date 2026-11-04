import { describe, it, expect } from 'vitest';
import { verboseOption } from '../../../src/cli/options/verbose.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';

describe('verboseOption.merge', () => {
  it('CLI true → true regardless of config', () => {
    expect(verboseOption.merge(true, {})).toBe(true);
    expect(verboseOption.merge(true, { verbose: false })).toBe(true);
  });

  it('CLI false + config.verbose === true → true (OR semantics)', () => {
    expect(verboseOption.merge(false, { verbose: true })).toBe(true);
  });

  it('CLI false + config.verbose !== true → false', () => {
    expect(verboseOption.merge(false, {})).toBe(false);
    expect(verboseOption.merge(false, { verbose: false })).toBe(false);
  });
});

describe('verbose parser integration (each alias separately)', () => {
  it("'-v' sets values.verbose = true", () => {
    expect(parseInvocation(['-v']).values.verbose).toBe(true);
  });

  it("'-V' sets values.verbose = true", () => {
    expect(parseInvocation(['-V']).values.verbose).toBe(true);
  });

  it("'--verbose' sets values.verbose = true", () => {
    expect(parseInvocation(['--verbose']).values.verbose).toBe(true);
  });

  it('no verbose flag → values.verbose stays false', () => {
    expect(parseInvocation(['app.js']).values.verbose).toBe(false);
  });
});
