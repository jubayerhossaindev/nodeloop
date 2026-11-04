import { afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectConfigFile, CONFIG_FILES } from '../../../src/config/detection.js';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-detect-'));

afterAll(() => {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('CONFIG_FILES constant', () => {
  it('matches the documented detection order EXACTLY', () => {
    expect(CONFIG_FILES).toEqual([
      'nodeloop.json',
      '.nodelooprc',
      'nodeloop.toml',
      'nodeloop.yaml',
      'nodeloop.yml',
      'nodeloop.js',
      'nodeloop.mjs',
      'nodeloop.ts',
      'nodeloop.mts'
    ]);
  });
});

describe('detectConfigFile', () => {
  it('returns the FIRST existing file when every candidate is present (nodeloop.json wins)', () => {
    const direction = fs.mkdtempSync(path.join(temporaryRoot, 'all-'));
    for (const name of CONFIG_FILES) {
      fs.writeFileSync(path.join(direction, name), '');
    }
    expect(detectConfigFile(direction)).toBe(path.join(direction, 'nodeloop.json'));
  });

  it('skips missing higher-priority candidates (.nodelooprc beats toml/yaml/...)', () => {
    const direction = fs.mkdtempSync(path.join(temporaryRoot, 'rc-'));
    fs.writeFileSync(path.join(direction, '.nodelooprc'), '');
    fs.writeFileSync(path.join(direction, 'nodeloop.yaml'), '');
    fs.writeFileSync(path.join(direction, 'nodeloop.mts'), '');
    expect(detectConfigFile(direction)).toBe(path.join(direction, '.nodelooprc'));
  });

  it('picks the highest-priority file among a lower subset (toml over yaml/js/ts)', () => {
    const direction = fs.mkdtempSync(path.join(temporaryRoot, 'toml-'));
    fs.writeFileSync(path.join(direction, 'nodeloop.toml'), '');
    fs.writeFileSync(path.join(direction, 'nodeloop.yaml'), '');
    fs.writeFileSync(path.join(direction, 'nodeloop.js'), '');
    fs.writeFileSync(path.join(direction, 'nodeloop.ts'), '');
    expect(detectConfigFile(direction)).toBe(path.join(direction, 'nodeloop.toml'));
  });

  it('falls through to late candidates (mts is the last resort)', () => {
    const direction = fs.mkdtempSync(path.join(temporaryRoot, 'mts-'));
    fs.writeFileSync(path.join(direction, 'nodeloop.mts'), '');
    expect(detectConfigFile(direction)).toBe(path.join(direction, 'nodeloop.mts'));
  });

  it('returns null in an empty directory', () => {
    const direction = fs.mkdtempSync(path.join(temporaryRoot, 'empty-'));
    expect(detectConfigFile(direction)).toBeNull();
  });
});
