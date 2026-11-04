/**
createUI coverage beyond the main suite: the color:true forced path,
crash() without a code and the full humanizeSpawnError matrix.
*/
import { describe, it, expect } from 'vitest';
import { createUI } from '../../../src/terminal/ui.js';
import { stripAnsi } from '../../../src/terminal/colors.js';

describe('createUI — color handling', () => {
  it('color:true forces at least level 1 even without a TTY', () => {
    const forced = createUI({ color: true, env: {}, stream: {} });
    const painted = forced.green('x');
    expect(painted).not.toBe(stripAnsi(painted)); // real ANSI emitted
    expect(stripAnsi(painted)).toBe('x');
  });

  it('color:false emits no ANSI at all', () => {
    const off = createUI({ color: false, env: {}, stream: { isTTY: true } });
    expect(off.green('x')).toBe('x');
  });
});

describe('crash + startFailed rendering', () => {
  const ui = createUI({ color: false, unicode: false, env: {}, stream: {} });

  it('crash() without a code reports "exit code null"', () => {
    expect(ui.crash({})).toContain('exit code null');
  });

  it('humanizeSpawnError: ENOENT via message regex (no code field)', () => {
    const out = ui.startFailed({
      error: { message: 'spawn python3 ENOENT', code: undefined, path: undefined }
    });
    expect(out).toContain('Executable not found: python3');
  });

  it('humanizeSpawnError: EACCES becomes Permission denied', () => {
    const out = ui.startFailed({
      error: { message: 'spawn /opt/app EACCES', code: undefined, path: undefined }
    });
    expect(out).toContain('Permission denied: /opt/app');
  });

  it('humanizeSpawnError: an unrelated message passes through untouched', () => {
    const out = ui.startFailed({
      error: { message: 'weird failure', code: undefined, path: undefined }
    });
    expect(out).toContain('weird failure');
  });

  it('humanizeSpawnError: no error object at all → empty message rendered', () => {
    const out = ui.startFailed();
    expect(out).toContain('failed to start');
  });

  it('humanizeSpawnError: an EACCES code field wins without the message regex', () => {
    const out = ui.startFailed({ error: { message: 'denied', code: 'EACCES', path: '/opt/x' } });
    expect(out).toContain('Permission denied: /opt/x'); // err.path beats the raw message
  });

  it('humanizeSpawnError: an unrelated code with an EACCES message hits the message regex', () => {
    const out = ui.startFailed({
      error: { message: 'spawn /opt/x EACCES', code: 'EPERM', path: undefined }
    });
    expect(out).toContain('Permission denied: /opt/x');
  });

  it('humanizeSpawnError: a bare ENOENT message without the spawn shape strips the suffix', () => {
    const out = ui.startFailed({ error: { message: 'ENOENT', code: 'ENOENT', path: undefined } });
    expect(out).toContain('Executable not found:'); // empty name — suffix stripped
  });

  it('humanizeSpawnError: an ENOENT code field wins without the message regex', () => {
    const out = ui.startFailed({ error: { message: 'gone', code: 'ENOENT', path: '/opt/x' } });
    expect(out).toContain('Executable not found: /opt/x');
  });

  it('startFailed defaults to "watcher still active" when watching is undefined', () => {
    const out = ui.startFailed({ error: { message: 'spawn x ENOENT' } });
    expect(out).toContain('watcher still active');
  });

  it('startFailed with watching:false drops the still-active line', () => {
    const out = ui.startFailed({ error: { message: 'spawn x ENOENT' }, watching: false });
    expect(out).not.toContain('watcher still active');
  });
});
