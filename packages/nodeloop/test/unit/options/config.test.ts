import { describe, it, expect } from 'vitest';
import { configOption } from '../../../src/cli/options/config.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';
import { ConfigFileNotFoundError, NodeloopError } from '../../../src/errors/types.js';

describe('configOption.resolve', () => {
  it('resolves a relative path against the given cwd', () => {
    expect(configOption.resolve('cfg/nodeloop.json', '/work/project')).toBe(
      '/work/project/cfg/nodeloop.json'
    );
  });

  it('keeps an absolute path as-is', () => {
    expect(configOption.resolve('/etc/nodeloop.json', '/work/project')).toBe('/etc/nodeloop.json');
  });

  it('undefined flag → undefined', () => {
    expect(configOption.resolve(undefined, '/work/project')).toBeUndefined();
  });

  it("empty flag value ('') → undefined", () => {
    expect(configOption.resolve('', '/work/project')).toBeUndefined();
  });
});

describe('config flag parser integration', () => {
  it("'--config cfg.json' captures the raw flag value", () => {
    const parsed = parseInvocation(['--config', 'cfg.json']);
    expect(parsed.values.config).toBe('cfg.json');
    expect(parsed.scriptToken).toBeNull();
  });
});

describe('ConfigFileNotFoundError', () => {
  it("message contains the missing file: 'config file not found: <file>'", () => {
    const error = new ConfigFileNotFoundError('nodeloop.json');
    expect(error).toBeInstanceOf(ConfigFileNotFoundError);
    expect(error).toBeInstanceOf(NodeloopError);
    expect(error.message).toBe('config file not found: nodeloop.json');
    expect(error.message).toContain('nodeloop.json');
  });

  it('carries a hint listing the supported formats', () => {
    const error = new ConfigFileNotFoundError('custom.json');
    expect(error.hint).toBeDefined();
    expect(error.hint).toContain('nodeloop.json');
  });
});
