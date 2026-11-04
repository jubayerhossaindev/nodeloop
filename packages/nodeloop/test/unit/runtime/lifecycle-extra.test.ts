/**
ShutdownCoordinator — the double-finish guard (a second finisher arriving
after the result settled must be a no-op).
*/
import { describe, it, expect } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { ShutdownCoordinator, type StoppableWatcher } from '../../../src/runtime/lifecycle.js';

describe('ShutdownCoordinator — settled guard', () => {
  it('a second finisher after resolution is ignored (settled → return)', async () => {
    const watcher: StoppableWatcher = {
      stop() {},
      hasLiveChild: () => true,
      onChildExit: () => Promise.resolve() // resolves immediately → finish(true)
    };
    // clearTimeout is a NO-OP so the cap timer still fires later and calls
    // finish(false) a second time — the settled guard must swallow it.
    const coordinator = new ShutdownCoordinator({
      escalateMs: 5,
      capMs: 40,
      clearTimeoutImpl: () => {}
    });
    let killTreeCalls = 0;
    await expect(coordinator.shutdown(watcher, () => void killTreeCalls++)).resolves.toEqual({
      childStopped: true
    });
    // give the (uncleared) cap timer a chance to fire its no-op finish
    await delay(80);
    expect(killTreeCalls).toBe(1); // escalation ran once, then everything is settled
  });
});
