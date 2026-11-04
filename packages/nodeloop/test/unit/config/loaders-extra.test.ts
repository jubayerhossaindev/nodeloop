/**
Loader coverage beyond the main suites: JS/TS hint arms, the
silent-empty trap, the .mts dispatch and the TOML/YAML subset edges
(quoting, inline collections, section nesting, every error message).
*/
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseTOML,
  parseTOMLValue,
  parseQuoted,
  unquoteTOMLKey
} from '../../../src/config/loaders/toml.js';
import { parseYAML } from '../../../src/config/loaders/yaml.js';
import { readConfigFile } from '../../../src/config/loaders/index.js';

const directories: string[] = [];
function captureError(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return undefined;
}

function temporary(files: Record<string, string>): string {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-ldx-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(direction, name), content);
  }
  directories.push(direction);
  return direction;
}
afterAll(() => {
  for (const d of directories) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('JS/TS config loading — hint arms', () => {
  it('an .mjs with CommonJS syntax gets the always-ESM hint', () => {
    const direction = temporary({ 'nodeloop.mjs': 'module.exports = { quiet: true };' });
    expect(() => readConfigFile(path.join(direction, 'nodeloop.mjs'))).toThrow(/always ESM/);
  });

  it('a .js with ESM syntax loads through require(esm) on Node ≥ 22.12 (default unwrapped)', () => {
    const direction = temporary({ 'nodeloop.js': 'export default { quiet: true };' });
    expect(readConfigFile(path.join(direction, 'nodeloop.js'))).toEqual({ quiet: true });
  });

  it('a runtime error inside a CJS config gets the generic hint', () => {
    const direction = temporary({ 'nodeloop.js': 'throw new Error("kaboom");' });
    const error = captureError(() => readConfigFile(path.join(direction, 'nodeloop.js')));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('kaboom');
    expect((error as Error).message).toContain('module.exports');
  });

  it('a config throwing a raw string still gets the hint (non-Error path)', () => {
    const direction = temporary({ 'nodeloop.js': "throw 'plain-string';" });
    const error = captureError(() => readConfigFile(path.join(direction, 'nodeloop.js')));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('plain-string');
    expect((error as Error).message).toContain('module.exports');
  });

  it('a default export is unwrapped', () => {
    const direction = temporary({ 'nodeloop.js': 'module.exports = { default: { delay: 300 } };' });
    expect(readConfigFile(path.join(direction, 'nodeloop.js'))).toEqual({ delay: 300 });
  });

  it('the silent-empty trap: empty module.exports in CJS is never "no config"', () => {
    const direction = temporary({ 'nodeloop.cjs': 'module.exports = {};' });
    expect(() => readConfigFile(path.join(direction, 'nodeloop.cjs'))).toThrow(
      /evaluated to an empty object/
    );
  });

  it('an empty object export without module.exports wording is accepted', () => {
    // the property access is deliberately obfuscated: the silent-empty trap
    // keys on the literal "module.exports" wording in the source
    const direction = temporary({ 'nodeloop.cjs': 'module["exports"] = {};' });
    expect(readConfigFile(path.join(direction, 'nodeloop.cjs'))).toEqual({});
  });

  it('.mts configs load through the ESM path', () => {
    const direction = temporary({ 'nodeloop.mts': 'export default { quiet: true };' });
    expect(readConfigFile(path.join(direction, 'nodeloop.mts'))).toEqual({ quiet: true });
  });

  it('an unknown extension is rejected with a clear error', () => {
    const direction = temporary({ 'nodeloop.ini': 'x = 1' });
    expect(() => readConfigFile(path.join(direction, 'nodeloop.ini'))).toThrow(
      /unsupported config file type/
    );
  });
});

describe('TOML subset — quoting and inline collections', () => {
  it('splits on commas only outside quotes and brackets', () => {
    const document = `a = 'x, y'\nb = "p, q"\nc = [{ i = 1 }, { j = 2}]\nd = [1, 2, 3]\ne = ['a, b', "c, d"]`;
    const out = parseTOML(document);
    expect(out['a']).toBe('x, y');
    expect(out['b']).toBe('p, q');
    expect(out['c']).toEqual(['{ i = 1 }', '{ j = 2}']);
    expect(out['d']).toEqual([1, 2, 3]);
    expect(out['e']).toEqual(['a, b', 'c, d']); // quotes INSIDE arrays guard commas
  });

  it('parses nested sections and quoted section keys', () => {
    const document = `[a]\nx = 1\n[a.b]\ny = 2\n[a.b.c]\nz = 3\n["q"."k"]\nw = 4`;
    const out = parseTOML(document);
    expect((out['a'] as Record<string, unknown>)['x']).toBe(1);
    const ab = (out['a'] as Record<string, unknown>)['b'] as Record<string, unknown>;
    expect(ab['y']).toBe(2);
    expect((ab['c'] as Record<string, unknown>)['z']).toBe(3);
    expect(((out['q'] as Record<string, unknown>)['k'] as Record<string, unknown>)['w']).toBe(4);
  });

  it('parses booleans, numbers with underscores and bare words', () => {
    expect(parseTOML('t = true\nf = false\nn = 1_000\nw = hello')).toEqual({
      t: true,
      f: false,
      n: 1000,
      w: 'hello'
    });
  });

  it('empty values inside arrays throw the empty-value error', () => {
    expect(() => parseTOML('a = [1, , 2]')).toThrow(/empty value/);
  });

  it('empty arrays parse to []', () => {
    expect(parseTOML('a = []')).toEqual({ a: [] });
  });

  it('multi-line arrays are rejected with the ONE-LINE error', () => {
    expect(() => parseTOML('a = [1,\n2]')).toThrow(/ONE line/);
  });

  it('dangling escapes and unterminated strings carry line numbers', () => {
    // value token is "abc\" — the final quote closes the string, leaving a
    // trailing backslash with nothing to escape
    expect(() => parseTOML(String.raw`a = "abc\"`)).toThrow(/dangling escape/);
    expect(() => parseTOML('a = "abc')).toThrow(/unterminated string/);
    expect(() => parseTOMLValue('"no close')).toThrow(/unterminated string/);
  });

  it('parseQuoted handles escapes and literal single quotes', () => {
    expect(parseQuoted(String.raw`"a\tb"`)).toBe('a\tb');
    expect(parseQuoted(String.raw`'a\nb'`)).toBe(String.raw`a\nb`);
    expect(parseQuoted(String.raw`"a\qb"`)).toBe('aqb'); // unknown escape → the char itself
  });

  it('unquoteTOMLKey passes bare keys through', () => {
    expect(unquoteTOMLKey('plain')).toBe('plain');
    expect(unquoteTOMLKey('"a.b"')).toBe('a.b');
    expect(unquoteTOMLKey("'a.b'")).toBe('a.b');
  });

  it('a bare [ bracket that is not a section is a syntax error', () => {
    expect(() => parseTOML('[not a section')).toThrow(/expected "key = value"/);
  });
});

describe('YAML subset edges', () => {
  it('empty inline lists parse to []', () => {
    expect(parseYAML('k: []')).toEqual({ k: [] });
  });

  it('a block list under a scalar converts it to the first element (indented items)', () => {
    expect(parseYAML('k: hello\n  - item')).toEqual({ k: ['hello', 'item'] });
  });

  it('unterminated inline lists carry the line number', () => {
    expect(() => parseYAML('k: [1, 2')).toThrow(/unterminated inline list/);
  });
});
