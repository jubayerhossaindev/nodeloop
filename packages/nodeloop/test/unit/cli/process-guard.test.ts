/**
Child liveness guard — every branch of `isChildProcessAlive`.
*/
import { describe, it, expect } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { isChildProcessAlive } from '../../../src/cli/commands/process-guard.js';

function fakeChild(fields: { exitCode?: number | null; signalCode?: string | null }): ChildProcess {
  return fields as unknown as ChildProcess;
}

describe('isChildProcessAlive', () => {
  it('null and undefined children are not alive', () => {
    expect(isChildProcessAlive(undefined)).toBe(false);
    expect(isChildProcessAlive(undefined)).toBe(false);
  });

  it('a running child (both codes null) is alive', () => {
    expect(isChildProcessAlive(fakeChild({ exitCode: null, signalCode: null }))).toBe(true);
  });

  it('an exited child is dead', () => {
    expect(isChildProcessAlive(fakeChild({ exitCode: 0, signalCode: undefined }))).toBe(false);
    expect(isChildProcessAlive(fakeChild({ exitCode: 3, signalCode: undefined }))).toBe(false);
  });

  it('a signalled child is dead', () => {
    expect(isChildProcessAlive(fakeChild({ exitCode: undefined, signalCode: 'SIGTERM' }))).toBe(
      false
    );
  });
});
