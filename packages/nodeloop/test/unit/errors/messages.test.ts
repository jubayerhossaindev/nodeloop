/**
Every MESSAGES builder — the single source of truth for CLI wording.
Each builder is invoked directly so the catalog cannot silently rot.
*/
import { describe, it, expect } from 'vitest';
import { MESSAGES } from '../../../src/errors/messages.js';

describe('MESSAGES catalog', () => {
  it('renders the lifecycle lines', () => {
    expect(MESSAGES.banner('1.2.3')).toBe('1.2.3');
    expect(MESSAGES.rsHint('rs')).toBe('to restart at any time, enter rs');
    expect(MESSAGES.watchingPaths('src')).toBe('watching path(s): src');
    expect(MESSAGES.watchingExts('js')).toBe('watching extensions: js');
    expect(MESSAGES.starting('node app.js')).toBe('starting node app.js');
    expect(MESSAGES.restartingDueToChanges).toContain('restarting');
    expect(MESSAGES.restartingManually).toContain('manually');
    expect(MESSAGES.cleanExit).toContain('clean exit');
  });

  it('renders crash + spawn failure blocks', () => {
    expect(MESSAGES.crashLines(3)).toEqual([
      'app crashed — exit code 3',
      'watching for changes',
      'fix the error and save a file to retry'
    ]);
    expect(MESSAGES.crashLines(undefined)[0]).toContain('null');
    expect(MESSAGES.failedToStart).toBe('failed to start');
    expect(MESSAGES.executableNotFound('tsx')).toBe('Executable not found: tsx');
    expect(MESSAGES.permissionDenied('/srv/app')).toBe('Permission denied: /srv/app');
    expect(MESSAGES.checkExecutableConfig).toContain('executable');
    expect(MESSAGES.watcherStillActive).toContain('still active');
  });

  it('renders config + validation wording', () => {
    expect(MESSAGES.invalidConfiguration).toBe('invalid configuration');
    expect(MESSAGES.checkConfiguration).toContain('configuration');
    expect(MESSAGES.stopping).toBe('stopping...');
    expect(MESSAGES.terminatingChild).toBe('terminating child process');
    expect(MESSAGES.stopped).toBe('nodeloop stopped');
    expect(MESSAGES.unknownKeys('nodeloop.json', ['a', 'b'])).toBe(
      'unknown key(s) in nodeloop.json: a, b — ignored'
    );
    expect(MESSAGES.badKeys(['delay'])).toBe('invalid value for key(s): delay — using defaults');
    expect(MESSAGES.noScript).toBe('no script given and none found');
    expect(MESSAGES.scriptNotFound('server.js')).toBe('script not found: server.js');
    expect(MESSAGES.lagNotSupported).toContain('no lag monitor');
    expect(MESSAGES.configNotFound('x.json')).toBe('config file not found: x.json');
    expect(MESSAGES.scriptIsDirectory('dir/')).toContain('script is a directory: dir/');
  });

  it('renders the verbose diagnostics', () => {
    expect(MESSAGES.verboseSpawned).toBe('child process spawned');
    expect(MESSAGES.verboseChange('app.js')).toBe('file change detected: app.js');
    expect(MESSAGES.verboseQueued(200)).toBe('restart queued (debounce 200ms)');
    expect(MESSAGES.verboseDebounced).toBe('debounce completed');
    expect(MESSAGES.verboseStopping).toBe('stopping previous process');
  });
});
