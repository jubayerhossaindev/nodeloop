/**
Child liveness guard — the TypeScript-side mirror of `isChildDead` from
lib/watch.js: dead ⇔ exit code set OR a signal code set. In the native
architecture the Rust supervisor owns the real child, so this helper only
guards a directly-held `ChildProcess` (used by tests and by the contract
checks that spawn helper processes).
*/
import type { ChildProcess } from 'node:child_process';

/**
dead ⇔ (exitCode set OR signalCode set).
*/
export function isChildProcessAlive(child: ChildProcess | null | undefined): boolean {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}
