import { describe, it, expect } from 'vitest';
import { quietOption } from '../../../src/cli/options/quiet.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';

describe('quietOption.merge', () => {
  it('CLI true → true regardless of config', () => {
    expect(quietOption.merge(true, {})).toBe(true);
    expect(quietOption.merge(true, { quiet: false })).toBe(true);
  });

  it('CLI false + config.quiet === true → true (OR semantics)', () => {
    expect(quietOption.merge(false, { quiet: true })).toBe(true);
  });

  it('CLI false + config.quiet !== true → false', () => {
    expect(quietOption.merge(false, {})).toBe(false);
    expect(quietOption.merge(false, { quiet: false })).toBe(false);
  });
});

describe('quiet parser integration (each alias separately)', () => {
  it("'-q' sets values.quiet = true", () => {
    expect(parseInvocation(['-q']).values.quiet).toBe(true);
  });

  it("'--quiet' sets values.quiet = true", () => {
    expect(parseInvocation(['--quiet']).values.quiet).toBe(true);
  });

  it('no quiet flag → values.quiet stays false', () => {
    expect(parseInvocation(['app.js']).values.quiet).toBe(false);
  });
});
