/**
Platform detection — currentPlatform + isWindows (default and explicit).
*/
import { describe, it, expect } from 'vitest';
import { currentPlatform, isWindows } from '../../../src/utils/platform.js';

describe('platform helpers', () => {
  it('currentPlatform reports the real process.platform', () => {
    expect(currentPlatform()).toBe(process.platform);
  });

  it('isWindows defaults to the real platform', () => {
    expect(isWindows()).toBe(process.platform === 'win32');
  });

  it('isWindows honors explicit platforms', () => {
    expect(isWindows('win32')).toBe(true);
    expect(isWindows('linux')).toBe(false);
    expect(isWindows('darwin')).toBe(false);
  });
});
