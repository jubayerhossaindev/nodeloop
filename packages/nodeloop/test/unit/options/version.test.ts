import { describe, it, expect } from 'vitest';
import { isVersionRequested, VERSION_FLAGS } from '../../../src/cli/options/version.js';

describe('isVersionRequested', () => {
  it("'--version' anywhere → true", () => {
    expect(isVersionRequested(['--version'])).toBe(true);
    expect(isVersionRequested(['app.js', '--version'])).toBe(true);
  });

  it('no --version flag → false', () => {
    expect(isVersionRequested(['app.js'])).toBe(false);
    expect(isVersionRequested([])).toBe(false);
  });

  it('-v / -V / --verbose are NOT version flags', () => {
    expect(isVersionRequested(['-v'])).toBe(false);
    expect(isVersionRequested(['-V'])).toBe(false);
    expect(isVersionRequested(['--verbose'])).toBe(false);
  });
});

describe('VERSION_FLAGS', () => {
  it('is exactly [--version]', () => {
    expect(VERSION_FLAGS).toEqual(['--version']);
  });
});
