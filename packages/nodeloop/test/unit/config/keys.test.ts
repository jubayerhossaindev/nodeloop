import { describe, it, expect } from 'vitest';
import {
  parseScript,
  parseScriptArgs as parseScriptArguments
} from '../../../src/config/keys/execution.js';
import {
  parseExt as parseExtension,
  parseIgnore,
  parseWatch,
  parseLegacyWatch
} from '../../../src/config/keys/watch.js';
import { parseDelay, parseMaxWait, parseRestartable } from '../../../src/config/keys/restart.js';
import {
  parseKillSignal,
  parseKillTimeout,
  parseEnv as parseEnvironment,
  parseExec,
  parseNodeArgs as parseNodeArguments,
  parseExecMap
} from '../../../src/config/keys/process.js';
import { parseVerbose, parseQuiet, parseColours } from '../../../src/config/keys/terminal.js';
import { parseEvents } from '../../../src/config/keys/events.js';

describe('parseScript', () => {
  it('accepts a non-empty string', () => {
    expect(parseScript('app.js')).toEqual({ ok: true, set: { script: 'app.js' } });
  });

  it('whitespace-trims the value', () => {
    expect(parseScript('  server.js  ')).toEqual({ ok: true, set: { script: 'server.js' } });
  });

  it('rejects numbers', () => {
    expect(parseScript(42).ok).toBe(false);
  });

  it('rejects empty and whitespace-only strings', () => {
    expect(parseScript('').ok).toBe(false);
    expect(parseScript(' '.repeat(3)).ok).toBe(false);
  });
});

describe('parseScriptArgs', () => {
  it('accepts mixed strings and numbers, stringifying numbers', () => {
    expect(parseScriptArguments(['--port', 3000, 'x'])).toEqual({
      ok: true,
      set: { scriptArgs: ['--port', '3000', 'x'] }
    });
  });

  it('rejects booleans in the list', () => {
    expect(parseScriptArguments(['--flag', true]).ok).toBe(false);
  });

  it('rejects a bare string', () => {
    expect(parseScriptArguments('--x').ok).toBe(false);
  });
});

describe('parseExt', () => {
  it('keeps a string as-is', () => {
    expect(parseExtension('js,json')).toEqual({ ok: true, set: { ext: 'js,json' } });
  });

  it('joins an array with commas', () => {
    expect(parseExtension(['js', 'json', 'ts'])).toEqual({ ok: true, set: { ext: 'js,json,ts' } });
  });

  it('rejects an empty array and an empty string', () => {
    expect(parseExtension([]).ok).toBe(false);
    expect(parseExtension('').ok).toBe(false);
    expect(parseExtension(' '.repeat(3)).ok).toBe(false);
  });
});

describe('parseIgnore', () => {
  it('wraps a single string into a one-element array', () => {
    expect(parseIgnore('uploads')).toEqual({ ok: true, set: { ignore: ['uploads'] } });
  });

  it('accepts an array of names', () => {
    expect(parseIgnore(['uploads', 'logs'])).toEqual({
      ok: true,
      set: { ignore: ['uploads', 'logs'] }
    });
  });

  it('rejects empty input', () => {
    expect(parseIgnore('').ok).toBe(false);
    expect(parseIgnore([]).ok).toBe(false);
  });
});

describe('parseWatch', () => {
  it('keeps a string as a string', () => {
    expect(parseWatch('src')).toEqual({ ok: true, set: { watch: 'src' } });
  });

  it('keeps an array as an array', () => {
    expect(parseWatch(['src', 'lib'])).toEqual({ ok: true, set: { watch: ['src', 'lib'] } });
  });

  it('rejects empty input', () => {
    expect(parseWatch('').ok).toBe(false);
    expect(parseWatch([]).ok).toBe(false);
  });
});

describe('parseLegacyWatch', () => {
  it('accepts true and false', () => {
    expect(parseLegacyWatch(true)).toEqual({ ok: true, set: { legacyWatch: true } });
    expect(parseLegacyWatch(false)).toEqual({ ok: true, set: { legacyWatch: false } });
  });

  it('accepts a number >= 50 as the polling interval', () => {
    expect(parseLegacyWatch(50)).toEqual({ ok: true, set: { legacyWatch: 50 } });
    expect(parseLegacyWatch(1000)).toEqual({ ok: true, set: { legacyWatch: 1000 } });
  });

  it('rejects 49 and non-numeric values', () => {
    expect(parseLegacyWatch(49).ok).toBe(false);
    expect(parseLegacyWatch('x').ok).toBe(false);
  });
});

describe('parseDelay / parseMaxWait / parseKillTimeout', () => {
  it("accept '300' → the number 300", () => {
    expect(parseDelay('300')).toEqual({ ok: true, set: { delay: 300 } });
    expect(parseMaxWait('300')).toEqual({ ok: true, set: { maxWait: 300 } });
    expect(parseKillTimeout('300')).toEqual({ ok: true, set: { killTimeout: 300 } });
  });

  it('accept real positive numbers', () => {
    expect(parseDelay(250)).toEqual({ ok: true, set: { delay: 250 } });
    expect(parseMaxWait(4000)).toEqual({ ok: true, set: { maxWait: 4000 } });
    expect(parseKillTimeout(1500)).toEqual({ ok: true, set: { killTimeout: 1500 } });
  });

  it('reject 0 and negative numbers', () => {
    expect(parseDelay(0).ok).toBe(false);
    expect(parseDelay(-1).ok).toBe(false);
    expect(parseMaxWait(0).ok).toBe(false);
    expect(parseMaxWait(-1).ok).toBe(false);
    expect(parseKillTimeout(0).ok).toBe(false);
    expect(parseKillTimeout(-1).ok).toBe(false);
  });

  it('reject Infinity and NaN', () => {
    expect(parseDelay(Infinity).ok).toBe(false);
    expect(parseDelay(NaN).ok).toBe(false);
    expect(parseMaxWait(Infinity).ok).toBe(false);
    expect(parseMaxWait(NaN).ok).toBe(false);
    expect(parseKillTimeout(Infinity).ok).toBe(false);
    expect(parseKillTimeout(NaN).ok).toBe(false);
  });
});

describe('parseRestartable', () => {
  it('accepts a non-empty string (trimmed)', () => {
    expect(parseRestartable('go')).toEqual({ ok: true, set: { restartable: 'go' } });
    expect(parseRestartable(' rs ')).toEqual({ ok: true, set: { restartable: 'rs' } });
  });

  it('accepts false (disables stdin interception)', () => {
    expect(parseRestartable(false)).toEqual({ ok: true, set: { restartable: false } });
  });

  it('rejects true and empty strings', () => {
    expect(parseRestartable(true).ok).toBe(false);
    expect(parseRestartable('').ok).toBe(false);
    expect(parseRestartable('  ').ok).toBe(false);
  });
});

describe('parseKillSignal', () => {
  it("uppercases a lowercase signal name ('sigterm' → 'SIGTERM')", () => {
    expect(parseKillSignal('sigterm')).toEqual({ ok: true, set: { killSignal: 'SIGTERM' } });
  });

  it('accepts an already-uppercase valid signal', () => {
    expect(parseKillSignal('SIGKILL')).toEqual({ ok: true, set: { killSignal: 'SIGKILL' } });
  });

  it('rejects an unknown signal name and non-strings', () => {
    expect(parseKillSignal('NOTASIGNAL').ok).toBe(false);
    expect(parseKillSignal(15).ok).toBe(false);
    expect(parseKillSignal('').ok).toBe(false);
  });
});

describe('parseEnv', () => {
  it('stringifies every value', () => {
    expect(parseEnvironment({ a: 'x', b: 2, c: true })).toEqual({
      ok: true,
      set: { env: { a: 'x', b: '2', c: 'true' } }
    });
  });

  it('rejects arrays', () => {
    expect(parseEnvironment(['a', 'b']).ok).toBe(false);
  });

  it('rejects nested objects', () => {
    expect(parseEnvironment({ a: { nested: 1 } }).ok).toBe(false);
  });
});

describe('parseExec', () => {
  it('accepts a non-empty command string, trimmed', () => {
    expect(parseExec(' tsx ')).toEqual({ ok: true, set: { exec: 'tsx' } });
    expect(parseExec('npm run dev')).toEqual({ ok: true, set: { exec: 'npm run dev' } });
  });

  it('rejects empty strings and non-strings', () => {
    expect(parseExec('').ok).toBe(false);
    expect(parseExec(' '.repeat(3)).ok).toBe(false);
    expect(parseExec(5).ok).toBe(false);
  });
});

describe('parseNodeArgs', () => {
  it('accepts arrays of strings/numbers, stringifying numbers', () => {
    expect(parseNodeArguments(['--inspect', 1])).toEqual({
      ok: true,
      set: { nodeArgs: ['--inspect', '1'] }
    });
  });

  it('rejects a bare string, booleans in the list, and plain objects', () => {
    expect(parseNodeArguments('--inspect').ok).toBe(false);
    expect(parseNodeArguments(['--inspect', true]).ok).toBe(false);
    expect(parseNodeArguments({ inspect: true }).ok).toBe(false);
  });
});

describe('parseExecMap', () => {
  it("normalizes keys (trim, lowercase, strip leading dot) and trims values: {'.TS':' tsx '} → {ts:'tsx'}", () => {
    expect(parseExecMap({ '.TS': ' tsx ' })).toEqual({
      ok: true,
      set: { execMap: { ts: 'tsx' } }
    });
    expect(parseExecMap({ JS: 'node' }).set).toEqual({ execMap: { js: 'node' } });
  });

  it('rejects arrays and non-string values', () => {
    expect(parseExecMap(['tsx']).ok).toBe(false);
    expect(parseExecMap({ ts: 5 }).ok).toBe(false);
    expect(parseExecMap({ ts: '' }).ok).toBe(false);
  });
});

describe('parseVerbose / parseQuiet / parseColours', () => {
  it('accept only strict booleans', () => {
    expect(parseVerbose(true)).toEqual({ ok: true, set: { verbose: true } });
    expect(parseVerbose(false)).toEqual({ ok: true, set: { verbose: false } });
    expect(parseQuiet(true)).toEqual({ ok: true, set: { quiet: true } });
    expect(parseQuiet(false)).toEqual({ ok: true, set: { quiet: false } });
    expect(parseColours(true)).toEqual({ ok: true, set: { colours: true } });
    expect(parseColours(false)).toEqual({ ok: true, set: { colours: false } });
  });

  it('reject non-boolean values', () => {
    expect(parseVerbose('true').ok).toBe(false);
    expect(parseVerbose(1).ok).toBe(false);
    expect(parseQuiet('yes').ok).toBe(false);
    expect(parseColours('true').ok).toBe(false);
    expect(parseColours(0).ok).toBe(false);
  });
});

describe('parseEvents', () => {
  it('accepts an object overriding all five lifecycle events', () => {
    const events = { start: 's', restart: 'r', crash: 'c', exit: 'e', quit: 'q' };
    expect(parseEvents(events)).toEqual({ ok: true, set: { events } });
  });

  it('accepts a subset of the event keys', () => {
    expect(parseEvents({ restart: 'restarted!' })).toEqual({
      ok: true,
      set: { events: { restart: 'restarted!' } }
    });
  });

  it('rejects unknown event keys', () => {
    expect(parseEvents({ nope: 'x' }).ok).toBe(false);
    expect(parseEvents({ start: 's', unknown: 'u' }).ok).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(parseEvents({ start: 1 }).ok).toBe(false);
    expect(parseEvents({ start: true }).ok).toBe(false);
  });

  it('rejects arrays', () => {
    expect(parseEvents(['start']).ok).toBe(false);
  });
});
