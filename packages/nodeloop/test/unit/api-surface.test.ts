/**
Public API surface — importing `src/index.ts` executes every re-export
and pins the contract that all documented building blocks stay exported.
*/
import { describe, it, expect } from 'vitest';
import * as api from '../../src/index.js';

describe('public API surface', () => {
  it('exports the config layer', () => {
    expect(typeof api.loadConfig).toBe('function');
    expect(typeof api.loadConfigFile).toBe('function');
    expect(typeof api.sanitizeConfig).toBe('function');
    expect(api.KEY_PARSERS['script']).toBeTypeOf('function');
    expect(Object.keys(api.KEY_PARSERS).length).toBeGreaterThanOrEqual(20);
    expect(typeof api.readConfigFile).toBe('function');
    expect(typeof api.parseTOML).toBe('function');
    expect(typeof api.parseYAML).toBe('function');
    expect(typeof api.detectConfigFile).toBe('function');
  });

  it('exports the option layer', () => {
    expect(typeof api.parseInvocation).toBe('function');
    expect(typeof api.resolveOptions).toBe('function');
    expect(typeof api.isHelpRequested).toBe('function');
    expect(typeof api.isVersionRequested).toBe('function');
    expect(typeof api.resolveColorFlag).toBe('function');
    expect(typeof api.dropLeadingSeparator).toBe('function');
    expect(api.SEPARATOR).toBe('--');
    expect(typeof api.validateScript).toBe('function');
    expect(api.LAG_COMMAND).toBe('lag');
  });

  it('exports the runtime layer', () => {
    expect(typeof api.tokenizeCommand).toBe('function');
    expect(typeof api.winQuote).toBe('function');
    expect(typeof api.resolveSpawn).toBe('function');
    expect(typeof api.isExecutableFile).toBe('function');
    expect(typeof api.resolveScript).toBe('function');
    expect(typeof api.resolveScriptChain).toBe('function');
    expect(typeof api.noScriptHint).toBe('function');
    expect(typeof api.requireScriptOrExec).toBe('function');
    expect(typeof api.resolveExecMap).toBe('function');
    expect(typeof api.buildEnvironment).toBe('function');
    expect(typeof api.resolveScriptArguments).toBe('function');
    expect(typeof api.positive).toBe('function');
    expect(typeof api.normalizePollInterval).toBe('function');
    expect(typeof api.normalizeExtensions).toBe('function');
    expect(typeof api.normalizeIgnores).toBe('function');
    expect(typeof api.normalizeWatchPaths).toBe('function');
    expect(typeof api.ShutdownCoordinator).toBe('function');
  });

  it('exports the interactive layer', () => {
    expect(typeof api.restartMatcher).toBe('function');
    expect(Array.isArray(api.DEFAULT_RESTART_WORDS)).toBe(true);
    expect(typeof api.forwardStdin).toBe('function');
    expect(typeof api.shouldInterceptStdin).toBe('function');
    expect(typeof api.restartWord).toBe('function');
  });

  it('exports the terminal layer', () => {
    expect(typeof api.createUI).toBe('function');
    expect(typeof api.detectColor).toBe('function');
    expect(typeof api.detectColorLevel).toBe('function');
    expect(typeof api.detectUnicode).toBe('function');
    expect(typeof api.nearest256).toBe('function');
    expect(typeof api.PALETTE).toBe('object');
    expect(typeof api.STYLE_ALIASES).toBe('object');
    expect(typeof api.stripAnsi).toBe('function');
    expect(typeof api.SYM_UNICODE).toBe('object');
    expect(typeof api.SYM_ASCII).toBe('object');
    expect(typeof api.getSymbols).toBe('function');
    expect(typeof api.createStyles).toBe('function');
    expect(typeof api.hhmmss).toBe('function');
    expect(typeof api.BRAND).toBe('string');
  });

  it('exports the native bridge layer', () => {
    expect(typeof api.loadNativeBinding).toBe('function');
    expect(typeof api.isNativeAvailable).toBe('function');
    expect(typeof api.platformPackageName).toBe('function');
    expect(typeof api.NativeWatcher).toBe('function');
    expect(typeof api.NativeLoadError).toBe('function');
    expect(typeof api.NativeContractError).toBe('function');
    expect(typeof api.NativeOperationError).toBe('function');
  });

  it('exports the error taxonomy', () => {
    expect(typeof api.NodeloopError).toBe('function');
    expect(typeof api.ConfigFileNotFoundError).toBe('function');
    expect(typeof api.InvalidConfigError).toBe('function');
    expect(typeof api.NoScriptError).toBe('function');
    expect(typeof api.ScriptNotFoundError).toBe('function');
    expect(typeof api.ScriptIsDirectoryError).toBe('function');
    expect(typeof api.MESSAGES).toBe('object');
  });

  it('exports the process guard', () => {
    expect(typeof api.isChildProcessAlive).toBe('function');
  });

  it('keeps the documented defaults', () => {
    expect(api.DEFAULT_EXTS).toEqual(['js', 'mjs', 'cjs', 'json']);
    expect(Array.isArray(api.DEFAULT_IGNORES)).toBe(true);
    expect(api.DEFAULT_DELAY).toBe(200);
    expect(api.DEFAULT_MAX_WAIT).toBe(0);
    expect(api.DEFAULT_KILL_SIGNAL).toBe('SIGTERM');
    expect(api.DEFAULT_KILL_TIMEOUT).toBe(3000);
  });
});
