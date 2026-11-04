import { afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJsonWithBom } from '../../../src/config/loaders/json.js';
import { parseRc } from '../../../src/config/loaders/rc.js';
import { parseTOML, stripComment } from '../../../src/config/loaders/toml.js';
import { parseYAML } from '../../../src/config/loaders/yaml.js';
import { readConfigFile } from '../../../src/config/loaders/index.js';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-load-'));

afterAll(() => {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

function write(name: string, content: string): string {
  const file = path.join(temporaryRoot, name);
  fs.writeFileSync(file, content);
  return file;
}

describe('parseJsonWithBom', () => {
  it('strips a leading U+FEFF BOM before parsing', () => {
    expect(parseJsonWithBom('\u{FEFF}{"ext":"js"}')).toEqual({ ext: 'js' });
  });

  it('parses plain JSON unchanged', () => {
    expect(parseJsonWithBom('{"delay": 500}')).toEqual({ delay: 500 });
  });
});

describe('parseRc', () => {
  it('delegates to the JSON parser (BOM-tolerant)', () => {
    expect(parseRc('{"ext":"ts"}')).toEqual({ ext: 'ts' });
    expect(parseRc('\u{FEFF}{"ignore":"logs"}')).toEqual({ ignore: 'logs' });
  });
});

describe('parseTOML', () => {
  it('parses key=value, booleans, numbers and single-line arrays', () => {
    const out = parseTOML(
      [
        'ext = "js"',
        'delay = 500',
        'verbose = true',
        'quiet = false',
        'ignore = [ "uploads", "logs" ]'
      ].join('\n')
    );
    expect(out).toEqual({
      ext: 'js',
      delay: 500,
      verbose: true,
      quiet: false,
      ignore: ['uploads', 'logs']
    });
  });

  it('unescapes quoted strings including newlines, quotes, and backslashes', () => {
    const out = parseTOML('msg = "line1\\nline2"\nq = "say \\"hi\\""\np = "a\\\\b"');
    expect(out.msg).toBe('line1\nline2');
    expect(out.q).toBe('say "hi"');
    expect(out.p).toBe(String.raw`a\b`);
  });

  it("keeps literal 'strings' verbatim (no escape processing, '#' inside is safe)", () => {
    expect(parseTOML(String.raw`lit = 'a#b\nc'`)).toEqual({ lit: String.raw`a#b\nc` });
  });

  it('parses numbers with underscore separators (1_000 → 1000)', () => {
    expect(parseTOML('delay = 1_000')).toEqual({ delay: 1000 });
    expect(parseTOML('maxWait = 2_500')).toEqual({ maxWait: 2500 });
  });

  it('[section] headers create nested objects', () => {
    expect(parseTOML('[watch]\next = "js"')).toEqual({ watch: { ext: 'js' } });
    expect(parseTOML('[a.b]\nk = 1')).toEqual({ a: { b: { k: 1 } } });
  });

  it('comments: stripped at line start and after whitespace, but NEVER inside quotes', () => {
    const out = parseTOML(
      '# full line comment\next = "js" # trailing comment\nh = "a#b"\nk2 = a#b'
    );
    expect(out).toEqual({ ext: 'js', h: 'a#b', k2: 'a#b' });
    expect(stripComment('k = "v # t"', '#')).toBe('k = "v # t"');
  });

  it('unsupported syntax throws naming the line number', () => {
    expect(() => parseTOML('ext = "js"\nthis is not toml')).toThrowError(
      /unsupported TOML syntax at line 2/
    );
  });

  it('an array spanning multiple lines throws (arrays must be on ONE line)', () => {
    expect(() => parseTOML('ignore = [ "a",\n "b" ]')).toThrowError(/arrays must be on ONE line/);
  });

  it('an unterminated string throws', () => {
    expect(() => parseTOML('script = "abc')).toThrowError(/unterminated string/);
  });
});

describe('parseYAML', () => {
  it('parses flat key: value with numbers, booleans, quoted and bare scalars', () => {
    const out = parseYAML(
      [
        'ext: js,mjs,json',
        'delay: 300',
        'verbose: true',
        'quiet: false',
        'script: "app.js"',
        "name: 'dev server'"
      ].join('\n')
    );
    expect(out).toEqual({
      ext: 'js,mjs,json',
      delay: 300,
      verbose: true,
      quiet: false,
      script: 'app.js',
      name: 'dev server'
    });
  });

  it('block lists (- item) build arrays; inline [a, b] works too', () => {
    expect(parseYAML('ignore:\n  - uploads\n  - logs')).toEqual({ ignore: ['uploads', 'logs'] });
    expect(parseYAML('ext: [js, ts]')).toEqual({ ext: ['js', 'ts'] });
  });

  it('comments are stripped outside quotes', () => {
    const out = parseYAML('# top\next: js # trailing\nh: "a#b"');
    expect(out).toEqual({ ext: 'js', h: 'a#b' });
  });

  it('`key:` with no value followed by items becomes the array; without items it is dropped', () => {
    expect(parseYAML('ignore:\n  - a\n  - b')).toEqual({ ignore: ['a', 'b'] });
    const out = parseYAML('foo:\next: js');
    expect(out).toEqual({ ext: 'js' });
    expect('foo' in out).toBe(false);
  });

  it('unsupported syntax throws naming the line number', () => {
    expect(() => parseYAML('just some text')).toThrowError(/unsupported YAML syntax at line 1/);
    expect(() => parseYAML('ext: js\n\tbad indent line')).toThrowError(
      /unsupported YAML syntax at line 2/
    );
  });

  it('an unterminated inline list throws with the line number', () => {
    expect(() => parseYAML('ext: [js')).toThrowError(/line 1: unterminated inline list/);
  });
});

describe('readConfigFile dispatch by extension', () => {
  it('.json → JSON parser', () => {
    expect(readConfigFile(write('cfg.json', '{"ext":"js"}'))).toEqual({ ext: 'js' });
  });

  it('.nodelooprc (no extension) → JSON parser', () => {
    expect(readConfigFile(write('.nodelooprc', '{"ignore":"logs"}'))).toEqual({ ignore: 'logs' });
  });

  it('.toml → TOML parser', () => {
    expect(readConfigFile(write('cfg.toml', 'ext = "js"'))).toEqual({ ext: 'js' });
  });

  it('.yaml and .yml → YAML parser', () => {
    expect(readConfigFile(write('cfg.yaml', 'ext: js'))).toEqual({ ext: 'js' });
    expect(readConfigFile(write('cfg.yml', 'delay: 250'))).toEqual({ delay: 250 });
  });

  it('.cjs with module.exports works (always CommonJS)', () => {
    expect(readConfigFile(write('cfg.cjs', 'module.exports = { ext: "js" };'))).toEqual({
      ext: 'js'
    });
  });

  it('.mjs with `export default` works on Node >= 22.12 (this is Node 24)', () => {
    expect(readConfigFile(write('cfg.mjs', 'export default { ext: "js" };'))).toEqual({
      ext: 'js'
    });
  });

  it('.ts with `export default` works on Node 24 (type stripping)', () => {
    expect(readConfigFile(write('cfg.ts', 'export default { ext: "js" };'))).toEqual({
      ext: 'js'
    });
  });

  it('.js with ESM `export default` and NO package.json works on Node >= 22.12 (syntax detection + require(esm))', () => {
    // No package.json anywhere near tmpRoot → Node's module syntax detection
    // kicks in and require(esm) loads it (Node 24 sandbox).
    expect(readConfigFile(write('cfg-esm.js', 'export default { ext: "js" };'))).toEqual({
      ext: 'js'
    });
  });

  it('.js with ESM syntax in a "type": "commonjs" project throws with the CommonJS hint', () => {
    const direction = fs.mkdtempSync(path.join(temporaryRoot, 'cjs-proj-'));
    fs.writeFileSync(path.join(direction, 'package.json'), '{"name":"x","type":"commonjs"}');
    const file = path.join(direction, 'nodeloop.js');
    fs.writeFileSync(file, 'export default { ext: "js" };');
    expect(() => readConfigFile(file)).toThrowError(/CommonJS/);
  });

  it('an empty module.exports .cjs in an ESM project throws the empty-object error', () => {
    const direction = fs.mkdtempSync(path.join(temporaryRoot, 'esm-proj-'));
    fs.writeFileSync(path.join(direction, 'package.json'), '{"name":"x","type":"module"}');
    const file = path.join(direction, 'nodeloop.cjs');
    fs.writeFileSync(file, 'module.exports = {};');
    expect(() => readConfigFile(file)).toThrowError(/config evaluated to an empty object/);
  });

  it('an unsupported extension throws `unsupported config file type: <file>`', () => {
    const file = write('nodeloop.ini', 'ext = js');
    expect(() => readConfigFile(file)).toThrowError(`unsupported config file type: ${file}`);
  });
});
