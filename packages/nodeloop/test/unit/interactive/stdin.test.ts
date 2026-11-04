import { describe, expect, it, vi } from 'vitest';
import { forwardStdin, type StdinTarget } from '../../../src/interactive/stdin.js';

type DataListener = (chunk: string | Buffer) => void;

/**
Minimal EventEmitter-shaped stdin source: on / removeListener / emit helpers.
*/
class FakeStdinSource {
  private readonly dataListeners = new Set<DataListener>();
  private readonly closeListeners = new Set<() => void>();

  on(event: 'data', listener: DataListener): unknown;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'data' | 'close', listener: DataListener | (() => void)): unknown {
    if (event === 'data') {
      this.dataListeners.add(listener as DataListener);
    } else {
      this.closeListeners.add(listener as () => void);
    }
    return this;
  }

  removeListener(event: 'data', listener: DataListener): unknown;
  removeListener(event: 'close', listener: () => void): unknown;
  removeListener(event: 'data' | 'close', listener: DataListener | (() => void)): unknown {
    if (event === 'data') {
      this.dataListeners.delete(listener as DataListener);
    } else {
      this.closeListeners.delete(listener as () => void);
    }
    return this;
  }

  emitData(chunk: string): void {
    for (const listener of this.dataListeners) {
      listener(chunk);
    }
  }

  emitClose(): void {
    for (const listener of this.closeListeners) {
      listener();
    }
  }
}

describe('forwardStdin', () => {
  it('(a) forwards plain lines verbatim — several lines in ONE chunk', () => {
    const source = new FakeStdinSource();
    const write = vi.fn();
    const target: StdinTarget = { write };
    forwardStdin({ from: source, getTarget: () => target });

    source.emitData('line one\nline two\n');

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(1, 'line one\n');
    expect(write).toHaveBeenNthCalledWith(2, 'line two\n');
  });

  it("(b) 'rs' triggers onCommand and is NOT forwarded; other lines still pass", () => {
    const source = new FakeStdinSource();
    const write = vi.fn();
    const onCommand = vi.fn();
    const target: StdinTarget = { write };
    forwardStdin({ from: source, getTarget: () => target, onCommand });

    source.emitData('rs\n');
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();

    source.emitData('restart\r\n'); // second built-in word
    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(write).not.toHaveBeenCalled();

    source.emitData('hello\n');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('hello\n');
  });

  it('(c) forwards a partial line (no trailing newline) immediately', () => {
    const source = new FakeStdinSource();
    const write = vi.fn();
    const target: StdinTarget = { write };
    forwardStdin({ from: source, getTarget: () => target });

    source.emitData('hel');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('hel');

    source.emitData('lo\n'); // buffer was flushed with the partial line
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(2, 'lo\n');
  });

  it('(d) drops input without throwing while no child is live, recovers when one appears', () => {
    const source = new FakeStdinSource();
    const write = vi.fn();
    let target: StdinTarget | null = null;
    forwardStdin({ from: source, getTarget: () => target!, onCommand: vi.fn() });

    expect(() => source.emitData('gone\n')).not.toThrow();
    expect(write).not.toHaveBeenCalled();

    target = { write };
    source.emitData('live\n');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('live\n');
  });

  it('(e) uses a custom isCommand matcher when given (default words ignored)', () => {
    const source = new FakeStdinSource();
    const write = vi.fn();
    const onCommand = vi.fn();
    const target: StdinTarget = { write };
    forwardStdin({
      from: source,
      getTarget: () => target,
      onCommand,
      isCommand: (line) => line.trim() === 'quit'
    });

    source.emitData('quit\n');
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();

    source.emitData('rs\n'); // custom matcher replaces the rs/restart defaults
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('rs\n');
  });

  it('(f) detach stops listening — nothing forwarded afterwards', () => {
    const source = new FakeStdinSource();
    const write = vi.fn();
    const target: StdinTarget = { write };
    const forwarder = forwardStdin({ from: source, getTarget: () => target });

    forwarder.detach();
    source.emitData('after detach\n');

    expect(write).not.toHaveBeenCalled();
  });

  it("(f2) a 'close' event on the source also detaches", () => {
    const source = new FakeStdinSource();
    const write = vi.fn();
    const target: StdinTarget = { write };
    forwardStdin({ from: source, getTarget: () => target });

    source.emitClose();
    source.emitData('after close\n');

    expect(write).not.toHaveBeenCalled();
  });
});
