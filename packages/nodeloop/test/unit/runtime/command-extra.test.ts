/**
resolveSpawn coverage beyond the main suite: the win32 node-token rule,
the default-platform fallback and the optional-argument guards.
*/
import { describe, it, expect } from 'vitest';
import { resolveSpawn, tokenizeCommand } from '../../../src/runtime/command.js';

describe('resolveSpawn — extra branches', () => {
  it('win32: a leading bare `node` token spawns the running binary directly', () => {
    const spec = resolveSpawn('node --harmony', [], 'app.js', ['--p'], {
      platform: 'win32',
      exists: () => false
    });
    expect(spec).toEqual({
      file: process.execPath,
      args: ['--harmony', 'app.js', '--p'],
      shell: false
    });
  });

  it('win32: `node.exe` matches the same rule case-insensitively', () => {
    const spec = resolveSpawn('NODE.EXE', [], 'app.js', [], {
      platform: 'win32',
      exists: () => false
    });
    expect(spec.file).toBe(process.execPath);
    expect(spec.shell).toBe(false);
  });

  it('without explicit platform it falls back to the real process.platform', () => {
    const spec = resolveSpawn('app.js', [], undefined, [], {});
    expect(spec).toEqual({ file: 'app.js', args: [], shell: process.platform === 'win32' });
  });

  it('tolerates missing nodeArgs/scriptArgs (?? guards)', () => {
    const spec = resolveSpawn(
      'tsx src/main.ts',
      undefined as unknown as string[],
      undefined,
      undefined as unknown as string[],
      {
        platform: 'linux'
      }
    );
    expect(spec).toEqual({ file: 'tsx', args: ['src/main.ts'], shell: false });
  });

  it('an exec of bare quotes tokenizes to one empty token (documented behavior)', () => {
    const spec = resolveSpawn('""', [], 'app.js', [], { platform: 'linux', exists: () => false });
    expect(spec.args).toEqual(['app.js']);
    expect(spec.shell).toBe(false);
  });

  it('tokenizeCommand is quote-aware', () => {
    expect(tokenizeCommand('npm run "dev server"')).toEqual(['npm', 'run', 'dev server']);
    expect(tokenizeCommand("  a  'b c'  ")).toEqual(['a', 'b c']);
  });
});
