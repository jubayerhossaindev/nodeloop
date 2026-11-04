import { describe, it, expect } from 'vitest';
import { ALIAS_PARSERS } from '../../../src/config/keys/aliases.js';
import { parseScriptArgs as parseScriptArguments } from '../../../src/config/keys/execution.js';
import { parseKillSignal } from '../../../src/config/keys/process.js';
import { parseColours } from '../../../src/config/keys/terminal.js';
import { sanitizeConfig } from '../../../src/config/validator.js';

describe('ALIAS_PARSERS registry', () => {
  it('has exactly the three nodemon-style aliases: args, signal, colors', () => {
    expect(Object.keys(ALIAS_PARSERS).toSorted((a, b) => a - b)).toEqual([
      'args',
      'colors',
      'signal'
    ]);
  });

  it("'args' routes to parseScriptArgs, 'signal' to parseKillSignal, 'colors' to parseColours", () => {
    expect(ALIAS_PARSERS['args']).toBe(parseScriptArguments);
    expect(ALIAS_PARSERS['signal']).toBe(parseKillSignal);
    expect(ALIAS_PARSERS['colors']).toBe(parseColours);
  });
});

describe('aliases through sanitizeConfig', () => {
  it("{'args': ['--x']} lands in values.scriptArgs (and is NOT unknown/bad)", () => {
    const { values, unknownKeys, badKeys } = sanitizeConfig({ args: ['--x'] });
    expect(values.scriptArgs).toEqual(['--x']);
    expect(unknownKeys).toEqual([]);
    expect(badKeys).toEqual([]);
  });

  it("{'signal': 'sigint'} normalizes onto values.killSignal = 'SIGINT'", () => {
    const { values, unknownKeys, badKeys } = sanitizeConfig({ signal: 'sigint' });
    expect(values.killSignal).toBe('SIGINT');
    expect(unknownKeys).toEqual([]);
    expect(badKeys).toEqual([]);
  });

  it("{'colors': false} normalizes onto values.colours = false", () => {
    const { values, unknownKeys, badKeys } = sanitizeConfig({ colors: false });
    expect(values.colours).toBe(false);
    expect((values as Record<string, unknown>).colors).toBeUndefined();
    expect(unknownKeys).toEqual([]);
    expect(badKeys).toEqual([]);
  });

  it('an alias with a bad value is recorded in badKeys under the ALIAS name', () => {
    const { values, badKeys, unknownKeys } = sanitizeConfig({ args: 'nope' });
    expect(values.scriptArgs).toBeUndefined();
    expect(badKeys).toContain('args');
    expect(unknownKeys).toEqual([]);
  });

  it("the 'signal' alias with an invalid value lands in badKeys as 'signal'", () => {
    const { badKeys } = sanitizeConfig({ signal: 'NOTASIGNAL' });
    expect(badKeys).toContain('signal');
  });

  it("the 'colors' alias with a non-boolean lands in badKeys as 'colors'", () => {
    const { badKeys } = sanitizeConfig({ colors: 'yes' });
    expect(badKeys).toContain('colors');
  });
});
