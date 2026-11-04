import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShutdownCoordinator, type StoppableWatcher } from '../../../src/runtime/lifecycle.js';

describe('ShutdownCoordinator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns {childStopped:true} immediately when no child is live — no timers fire', async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const killTree = vi.fn();
    const watcher: StoppableWatcher = {
      stop,
      hasLiveChild: () => false,
      onChildExit: () => new Promise<void>(() => {})
    };
    const coordinator = new ShutdownCoordinator({
      escalateMs: 300,
      capMs: 2000,
      setTimeoutImpl: setTimeout,
      clearTimeoutImpl: clearTimeout
    });

    const result = await coordinator.shutdown(watcher, killTree);

    expect(result).toEqual({ childStopped: true });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(killTree).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(killTree).not.toHaveBeenCalled();
  });

  it('a child that exits quickly reports childStopped true (real timers, huge delays)', async () => {
    let resolveExit!: () => void;
    // Promise.withResolvers is outside the package's minimum Node 20.0 range.
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const stop = vi.fn();
    const killTree = vi.fn();
    const watcher: StoppableWatcher = {
      stop,
      hasLiveChild: () => true,
      onChildExit: () => exitPromise
    };
    const coordinator = new ShutdownCoordinator({ escalateMs: 60_000, capMs: 120_000 });

    const pending = coordinator.shutdown(watcher, killTree);
    resolveExit();

    await expect(pending).resolves.toEqual({ childStopped: true });
    expect(killTree).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('escalates to killTree after escalateMs exactly once; the cap fires {childStopped:false}', async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const killTree = vi.fn();
    const watcher: StoppableWatcher = {
      stop,
      hasLiveChild: () => true,
      onChildExit: () => new Promise<void>(() => {})
    };
    const coordinator = new ShutdownCoordinator({
      escalateMs: 300,
      capMs: 2000,
      setTimeoutImpl: setTimeout,
      clearTimeoutImpl: clearTimeout
    });

    const settled = coordinator.shutdown(watcher, killTree);

    await vi.advanceTimersByTimeAsync(299);
    expect(killTree).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(killTree).toHaveBeenCalledTimes(1); // escalation fired exactly once

    await vi.advanceTimersByTimeAsync(1400); // t = 1700 < cap
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(300); // t = 2000 → cap
    await expect(settled).resolves.toEqual({ childStopped: false });
    expect(killTree).toHaveBeenCalledTimes(1); // never escalated twice
    expect(stop).toHaveBeenCalledTimes(1); // watcher stopped silently up front
    await settled;
  });

  it('a child exit beats the cap: resolves {childStopped:true} and both timers are cleared', async () => {
    vi.useFakeTimers();
    const killTree = vi.fn();
    const stop = vi.fn();
    let resolveExit!: () => void;
    // Promise.withResolvers is outside the package's minimum Node 20.0 range.
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const watcher: StoppableWatcher = {
      stop,
      hasLiveChild: () => true,
      onChildExit: () => exitPromise
    };
    const coordinator = new ShutdownCoordinator({
      escalateMs: 300,
      capMs: 2000,
      setTimeoutImpl: setTimeout,
      clearTimeoutImpl: clearTimeout
    });

    const pending = coordinator.shutdown(watcher, killTree);
    await vi.advanceTimersByTimeAsync(500);
    expect(killTree).toHaveBeenCalledTimes(1);

    resolveExit();
    await expect(pending).resolves.toEqual({ childStopped: true });

    await vi.advanceTimersByTimeAsync(10_000); // cap was cleared — nothing left to settle/fire
    expect(killTree).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('never settles twice (the cap loses once the exit resolved)', async () => {
    vi.useFakeTimers();
    let resolveExit!: () => void;
    // Promise.withResolvers is outside the package's minimum Node 20.0 range.
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const watcher: StoppableWatcher = {
      stop: vi.fn(),
      hasLiveChild: () => true,
      onChildExit: () => exitPromise
    };
    const coordinator = new ShutdownCoordinator({
      escalateMs: 100,
      capMs: 250,
      setTimeoutImpl: setTimeout,
      clearTimeoutImpl: clearTimeout
    });

    const pending = coordinator.shutdown(watcher, vi.fn());

    await vi.advanceTimersByTimeAsync(150);
    resolveExit();
    const result = await pending;
    await vi.advanceTimersByTimeAsync(1000); // cap time passed long ago

    expect(result).toEqual({ childStopped: true });
  });
});
