/**
Config resolution coverage beyond the main suites: the package.json
fallback (absent / broken / non-object `nodeloop` key) and JS configs
that throw non-Error values (the `String(err)` branch).
*/
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, loadConfigFile } from '../../../src/config/resolver.js';
import { loadPackageJsonConfig } from '../../../src/config/loaders/package-json.js';

const directories: string[] = [];
function temporary(files: Record<string, string>): string {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-resource-'));
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

describe('loadPackageJsonConfig', () => {
  it('returns null for a missing package.json', () => {
    const packagePath = path.join(os.tmpdir(), 'definitely-not-here', 'package.json');
    expect(loadPackageJsonConfig(packagePath)).toBeNull();
  });

  it('returns null when the nodeloop key is absent', () => {
    const direction = temporary({ 'package.json': '{"name":"x"}' });
    expect(loadPackageJsonConfig(path.join(direction, 'package.json'))).toBeNull();
  });

  it('returns null for broken JSON (ignored, legacy parity)', () => {
    const direction = temporary({ 'package.json': '{broken' });
    expect(loadPackageJsonConfig(path.join(direction, 'package.json'))).toBeNull();
  });

  it('returns the raw nodeloop object when present', () => {
    const direction = temporary({ 'package.json': '{"nodeloop":{"delay":500}}' });
    expect(loadPackageJsonConfig(path.join(direction, 'package.json'))).toEqual({ delay: 500 });
  });
});

describe('loadConfig — package.json fallback errors', () => {
  it('a non-object nodeloop key surfaces as the error result', () => {
    const direction = temporary({ 'package.json': '{"nodeloop":"just-a-string"}' });
    const resource = loadConfig(direction);
    expect(resource.error).toBeInstanceOf(Error);
    expect(resource.error!.message).toContain('package.json');
    expect(resource.config).toEqual({});
  });

  it('auto-detect still wins over the package.json fallback', () => {
    const direction = temporary({
      'nodeloop.json': '{"delay":250}',
      'package.json': '{"nodeloop":{"delay":999}}'
    });
    const resource = loadConfig(direction);
    expect(resource.error).toBeNull();
    expect(resource.file).toContain('nodeloop.json');
    expect(resource.config.delay).toBe(250);
  });
});

describe('loadConfigFile — non-Error throwables from JS configs', () => {
  it('a config that throws a raw string keeps the string in the message', () => {
    const direction = temporary({ 'nodeloop.js': "throw 'boom-str';" });
    const resource = loadConfigFile(path.join(direction, 'nodeloop.js'));
    expect(resource.error).toBeInstanceOf(Error);
    expect(resource.error!.message).toContain('boom-str');
  });

  it('loadConfigFile surfaces syntax errors with the file name prefix', () => {
    const direction = temporary({ 'nodeloop.js': 'this is not javascript {' });
    const resource = loadConfigFile(path.join(direction, 'nodeloop.js'));
    expect(resource.error!.message).toContain('nodeloop.js');
  });
});
