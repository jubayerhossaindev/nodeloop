import { afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeConfig } from '../../../src/config/validator.js';
import { loadConfig, loadConfigFile } from '../../../src/config/resolver.js';
import { resolveOptions } from '../../../src/cli/options/mod.js';
import type { ParsedInvocation } from '../../../src/cli/options/types.js';
import type { NormalizedConfig } from '../../../src/config/schema.js';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-prec-'));

afterAll(() => {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

function subdir(name: string): string {
  const direction = path.join(temporaryRoot, name);
  fs.mkdirSync(direction);
  return direction;
}

describe('sanitizeConfig — key routing', () => {
  it('an unknown key goes to unknownKeys with its original name', () => {
    const { values, unknownKeys, badKeys } = sanitizeConfig({ nope: 1 });
    expect(unknownKeys).toEqual(['nope']);
    expect(badKeys).toEqual([]);
    expect(values).toEqual({});
  });

  it('a mistyped known key goes to badKeys and is NOT applied', () => {
    const { values, unknownKeys, badKeys } = sanitizeConfig({ ext: 42 });
    expect(badKeys).toEqual(['ext']);
    expect(unknownKeys).toEqual([]);
    expect(values.ext).toBeUndefined();
  });

  it('unknown AND bad keys are both recorded with their original names', () => {
    const { unknownKeys, badKeys } = sanitizeConfig({ nope: 1, ext: 42 });
    expect(unknownKeys).toEqual(['nope']);
    expect(badKeys).toEqual(['ext']);
  });

  it.each([undefined, 'str', 42, []])(
    'non-object root %p throws "config root must be an object"',
    (root) => {
      expect(() => sanitizeConfig(root)).toThrowError(/config root must be an object/);
    }
  );

  it("later duplicate semantic keys win: {'args':['a'],'scriptArgs':['b']} → scriptArgs ['b']", () => {
    const { values } = sanitizeConfig({ args: ['a'], scriptArgs: ['b'] });
    expect(values.scriptArgs).toEqual(['b']);
  });

  it("…and in reverse order too: {'scriptArgs':['b'],'args':['a']} → scriptArgs ['a']", () => {
    const { values } = sanitizeConfig({ scriptArgs: ['b'], args: ['a'] });
    expect(values.scriptArgs).toEqual(['a']);
  });

  it('valid keys are applied onto the normalized shape', () => {
    const { values } = sanitizeConfig({ ext: 'js,json', delay: '300', verbose: true });
    expect(values).toEqual({ ext: 'js,json', delay: 300, verbose: true });
  });
});

describe('loadConfig — full flow', () => {
  it('(a) no config anywhere → { config: {}, file: null, error: null }', () => {
    const direction = subdir('empty');
    const result = loadConfig(direction);
    expect(result).toEqual({ config: {}, file: null, unknownKeys: [], badKeys: [], error: null });
  });

  it('(b) nodeloop.json {ext:"js"} is detected and sanitized', () => {
    const direction = subdir('with-json');
    fs.writeFileSync(path.join(direction, 'nodeloop.json'), '{"ext":"js"}');
    const result = loadConfig(direction);
    expect(result.error).toBeNull();
    expect(result.config.ext).toBe('js');
    expect(result.file).toBe(path.join(direction, 'nodeloop.json'));
  });

  it('(c) a broken nodeloop.json → error whose message starts with "nodeloop.json:"', () => {
    const direction = subdir('broken-json');
    fs.writeFileSync(path.join(direction, 'nodeloop.json'), '{ not json !');
    const result = loadConfig(direction);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message.startsWith('nodeloop.json:')).toBe(true);
  });

  it('(d) the package.json "nodeloop" key is used when NO earlier config file exists', () => {
    const direction = subdir('pkg-key');
    fs.writeFileSync(
      path.join(direction, 'package.json'),
      '{"name":"x","nodeloop":{"ext":"ts","delay":400}}'
    );
    const result = loadConfig(direction);
    expect(result.error).toBeNull();
    expect(result.file).toBe(path.join(direction, 'package.json'));
    expect(result.config.ext).toBe('ts');
    expect(result.config.delay).toBe(400);
  });

  it('(d2) the package.json key is IGNORED when an earlier config file exists', () => {
    const direction = subdir('json-beats-pkg');
    fs.writeFileSync(path.join(direction, 'nodeloop.json'), '{"ext":"js"}');
    fs.writeFileSync(path.join(direction, 'package.json'), '{"nodeloop":{"ext":"ts"}}');
    const result = loadConfig(direction);
    expect(result.file).toBe(path.join(direction, 'nodeloop.json'));
    expect(result.config.ext).toBe('js');
  });

  it('(e) a broken package.json with no other config is ignored — no error', () => {
    const direction = subdir('broken-pkg');
    fs.writeFileSync(path.join(direction, 'package.json'), '{ broken !!');
    const result = loadConfig(direction);
    expect(result.error).toBeNull();
    expect(result.file).toBeNull();
    expect(result.config).toEqual({});
  });
});

describe('loadConfigFile — explicit path (--config)', () => {
  it('loads one explicit file', () => {
    const direction = subdir('explicit');
    const file = path.join(direction, 'nodeloop.json');
    fs.writeFileSync(file, '{"ext":"js","quiet":true}');
    const result = loadConfigFile(file);
    expect(result.error).toBeNull();
    expect(result.file).toBe(file);
    expect(result.config.ext).toBe('js');
    expect(result.config.quiet).toBe(true);
  });

  it('a missing explicit file → error containing "config file not found"', () => {
    const missing = path.join(temporaryRoot, 'nope', 'nodeloop.json');
    const result = loadConfigFile(missing);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain('config file not found');
  });
});

describe('CLI flags beat config values (resolveOptions)', () => {
  const config = { ext: 'js' } as NormalizedConfig;

  it('a CLI --ext value wins over config.ext', () => {
    const parsed: ParsedInvocation = {
      values: { ext: 'ts', verbose: false, quiet: false },
      scriptToken: undefined,
      afterScript: []
    };
    expect(resolveOptions(parsed, config, temporaryRoot).ext).toBe('ts');
  });

  it('with the CLI flag absent, the config value applies', () => {
    const parsed: ParsedInvocation = {
      values: { verbose: false, quiet: false },
      scriptToken: undefined,
      afterScript: []
    };
    expect(resolveOptions(parsed, config, temporaryRoot).ext).toBe('js');
  });
});
