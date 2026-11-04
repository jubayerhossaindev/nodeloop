/**
forwardStdin — the guards beyond the main suite: no getTarget at all,
and a target whose write() throws (child stdin already gone).
*/
import { describe, it, expect } from 'vitest';
import { forwardStdin } from '../../../src/interactive/stdin.js';

class Source {
  listeners: Array<(chunk: string | Buffer) => void> = [];
  close: Array<() => void> = [];
  on(event: 'data', l: (chunk: string | Buffer) => void): unknown;
  on(event: 'close', l: () => void): unknown;
  on(event: string, l: never): unknown {
    if (event === 'data') {
      this.listeners.push(l);
    } else {
      this.close.push(l);
    }
    return this;
  }
  removeListener(): unknown {
    return this;
  }
  emit(chunk: string): void {
    for (const l of this.listeners) {
      l(chunk);
    }
  }
}

describe('forwardStdin — guards', () => {
  it('without getTarget everything is dropped, commands still fire', () => {
    const source = new Source();
    let commands = 0;
    forwardStdin({ from: source, onCommand: () => void commands++ });
    source.emit('hello\n');
    source.emit('rs\n');
    expect(commands).toBe(1);
  });

  it('a throwing target write is swallowed (child stdin already gone)', () => {
    const source = new Source();
    forwardStdin({
      from: source,
      getTarget: () => ({
        write: () => {
          throw new Error('EPIPE');
        }
      })
    });
    expect(() => source.emit('hello\n')).not.toThrow();
  });

  it('partial lines are forwarded immediately and cleared', () => {
    const source = new Source();
    const got: string[] = [];
    forwardStdin({ from: source, getTarget: () => ({ write: (c) => void got.push(c) }) });
    source.emit('no-newline-yet');
    expect(got).toEqual(['no-newline-yet']);
    source.emit('more');
    expect(got).toEqual(['no-newline-yet', 'more']); // buffer was cleared after the partial
  });

  it('a matching line with no onCommand skips the callback without throwing', () => {
    const source = new Source();
    forwardStdin({ from: source, getTarget: () => ({ write: vi.fn() }) });
    // 'rs' matches the built-in restart word but onCommand is undefined
    expect(() => source.emit('rs\n')).not.toThrow();
  });
});
