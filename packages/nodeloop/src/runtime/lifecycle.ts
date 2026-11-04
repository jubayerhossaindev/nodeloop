/**
Shutdown lifecycle — a faithful port of the legacy `shutdown()`:
stop the watcher, then guarantee the child is dead before reporting
success. A child that ignores killSignal gets a tree-wide SIGKILL after
`escalateMs` (legacy: 300); a hard cap (`capMs`, legacy: 2000) guarantees
the CLI itself always exits. `✓ nodeloop stopped` is printed only by the
paths that follow an actual exit (or nothing left to kill) — never before
the shutdown really happened.

Timers are injectable so tests can run the escalation deterministically.
*/

/**
Injectable subset of the native watcher the coordinator drives.
*/
export interface StoppableWatcher {
  stop(): void;
  /**
  Whether a live child exists right now.
  */
  hasLiveChild(): boolean;
  /**
  Resolves when the child exits (or immediately when none is running).
  */
  onChildExit(): Promise<void>;
}

export interface ShutdownCoordinatorOptions {
  escalateMs?: number;
  capMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export interface ShutdownResult {
  /**
  true = the child actually exited (or none existed); false = the cap fired.
  */
  childStopped: boolean;
}

export class ShutdownCoordinator {
  private readonly escalateMs: number;
  private readonly capMs: number;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;

  constructor(options: ShutdownCoordinatorOptions = {}) {
    this.escalateMs = options.escalateMs ?? 300;
    this.capMs = options.capMs ?? 2000;
    this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
  }

  /**
  Stop the watcher and wait for the child.
  @param watcher the running watcher
  @param killTree hard-kill callback used for SIGKILL escalation
  */
  async shutdown(watcher: StoppableWatcher, killTree: () => void): Promise<ShutdownResult> {
    watcher.stop();

    if (!watcher.hasLiveChild()) {
      return { childStopped: true };
    }

    return new Promise<ShutdownResult>((resolve) => {
      let isSettled = false;
      const timers: { escalate?: NodeJS.Timeout; cap?: NodeJS.Timeout } = {};
      const finish = (result: ShutdownResult) => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        /* c8 ignore start — timers.escalate/timers.cap are always set before finish() runs;
         * these are defensive null checks that cannot be reached in practice */
        if (timers.escalate) {
          this.clearTimeoutImpl(timers.escalate);
        }
        if (timers.cap) {
          this.clearTimeoutImpl(timers.cap);
        }
        /* c8 ignore end */
        resolve(result);
      };
      timers.escalate = this.setTimeoutImpl(() => killTree(), this.escalateMs);
      timers.cap = this.setTimeoutImpl(() => finish({ childStopped: false }), this.capMs);
      void watcher.onChildExit().then(() => finish({ childStopped: true }));
    });
  }
}
