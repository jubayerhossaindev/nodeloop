import { describe, expect, it } from 'vitest';
import { resolveScriptArgs as resolveScriptArguments } from '../../../src/runtime/arguments.js';

describe('resolveScriptArgs', () => {
  it('non-empty afterScript wins VERBATIM over config scriptArgs', () => {
    expect(resolveScriptArguments(['--port', '3000'], ['--config-only'])).toEqual([
      '--port',
      '3000'
    ]);
  });

  it('empty afterScript falls back to config scriptArgs', () => {
    expect(resolveScriptArguments([], ['--config', 'x'])).toEqual(['--config', 'x']);
  });

  it('both empty (or undefined config) → []', () => {
    expect(resolveScriptArguments([], undefined)).toEqual([]);
    expect(resolveScriptArguments([], [])).toEqual([]);
  });

  it('does not reorder or deduplicate the verbatim tokens', () => {
    expect(resolveScriptArguments(['--b', '--a', '--b'], undefined)).toEqual(['--b', '--a', '--b']);
  });
});
