/**
Registry consistency — KNOWN_KEYS and the KEY_PARSERS registry must agree
exactly (the sanitize guard "if (!parser)" is only a future-edit safety
net; this test is what keeps it unreachable).
*/
import { describe, it, expect } from 'vitest';
import { KNOWN_KEYS, EVENT_KEYS } from '../../../src/config/schema.js';
import { KEY_PARSERS } from '../../../src/config/validator.js';

describe('KEY_PARSERS ↔ KNOWN_KEYS consistency', () => {
  it('every known key has a parser', () => {
    for (const key of KNOWN_KEYS) {
      expect(KEY_PARSERS[key], `missing parser for "${key}"`).toBeTypeOf('function');
    }
  });

  it('every parser belongs to a known key (no drift in either direction)', () => {
    for (const key of Object.keys(KEY_PARSERS)) {
      expect(KNOWN_KEYS.has(key), `parser for unknown key "${key}"`).toBe(true);
    }
  });

  it('covers the documented 21-key surface including the nodemon-compat keys', () => {
    for (const key of [
      'script',
      'scriptArgs',
      'args',
      'ext',
      'ignore',
      'watch',
      'delay',
      'maxWait',
      'verbose',
      'quiet',
      'killSignal',
      'signal',
      'killTimeout',
      'env',
      'exec',
      'nodeArgs',
      'execMap',
      'restartable',
      'colours',
      'colors',
      'legacyWatch',
      'events'
    ]) {
      expect(KNOWN_KEYS.has(key), `"${key}" must stay known`).toBe(true);
    }
  });

  it('the events subset exposes exactly the five documented hooks', () => {
    expect(Array.from(EVENT_KEYS).toSorted((a, b) => a.localeCompare(b))).toEqual(
      ['crash', 'exit', 'quit', 'restart', 'start'].toSorted((a, b) => a.localeCompare(b))
    );
  });
});
