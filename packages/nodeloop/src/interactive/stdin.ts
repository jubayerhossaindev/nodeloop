/**
TTY stdin forwarding — port of `lib/stdin.js forwardStdin`.

Every line the user types is forwarded verbatim to the current child —
except a line matching the restart word, which triggers `onCommand`.
Why only on a TTY: terminals deliver input line-buffered (canonical
mode), so a command line can be detected reliably. Partial lines are
forwarded immediately so interactive typing stays live.

The target is re-evaluated on every chunk (children respawn); when no
live child exists the input is dropped.
*/
import { restartMatcher, DEFAULT_RESTART_WORDS } from './restart-command.js';

/**
Resolves the current child's stdin sink, or null when nothing is live.
*/
export type StdinTarget = { write(chunk: string): void } | null | undefined;

export interface ForwardStdinOptions {
  /**
  Source stream — usually process.stdin.
  */
  from: {
    on(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
    on(event: 'close', listener: () => void): unknown;
    removeListener(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
    removeListener(event: 'close', listener: () => void): unknown;
  };
  /**
  Current child stdin sink (re-evaluated on every chunk).
  */
  getTarget: () => StdinTarget;
  /**
  Called for each restart-command line.
  */
  onCommand?: () => void;
  /**
  Custom line matcher (config `restartable`); defaults to rs/restart.
  */
  isCommand?: ((line: string) => boolean) | undefined;
}

export interface StdinForwarder {
  detach: () => void;
}

export function forwardStdin(options: ForwardStdinOptions): StdinForwarder {
  const { from, getTarget, onCommand } = options;
  const isMatch = options.isCommand ?? restartMatcher(DEFAULT_RESTART_WORDS);
  let buffer = '';

  const write = (s: string): void => {
    const target = getTarget ? getTarget() : undefined;
    if (!target) {
      return;
    } // no live child (crashed / restarting) — drop the input
    try {
      target.write(s);
    } catch {
      /*
      child stdin already gone
      */
    }
  };

  const onData = (chunk: string | Buffer): void => {
    buffer += String(chunk);
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const line = buffer.slice(0, nl + 1);
      buffer = buffer.slice(nl + 1);
      if (isMatch(line)) {
        if (onCommand) {
          onCommand();
        }
      } else {
        write(line);
      }
      nl = buffer.indexOf('\n');
    }
    if (!buffer) {
      return;
    }

    // partial line — forward immediately so interactive typing stays live.
    write(buffer);
    buffer = '';
  };

  from.on('data', onData);
  const onClose = (): void => {
    from.removeListener('data', onData);
    from.removeListener('close', onClose);
  };
  from.on('close', onClose);

  return { detach: onClose };
}
