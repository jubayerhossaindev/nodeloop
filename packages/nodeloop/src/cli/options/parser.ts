/**
argv scanner — a 1:1 port of the legacy `runnerMode()` token loop
(cli.js). Rules preserved exactly:

  • runner flags must come BEFORE the script;
  • the script is the first token that is not a runner flag / flag value;
  • everything after the script belongs to the app — verbatim, untouched;
  • long value flags accept `=` syntax (`--ext=js,json`) before the script;
  • a value flag at end-of-argv captures `''` (falsy downstream — the
    config value then wins, same as the legacy `||` merge);
  • `--` forces the next token to be the script and ends flag parsing;
  • duplicate value flags: FIRST occurrence wins (the legacy `pull()`
    removes the first pair; later ones are never read);
  • boolean flags: any occurrence counts (`tokens.includes(...)`).
*/
import type { FlagValues, ParsedInvocation } from './types.js';
import { dropLeadingSeparator } from './separator.js';
import { resolveColorFlag } from './color.js';

/**
[longName, shortName] — order is irrelevant, membership is what matters.
*/
export const VALUE_FLAG_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['--ext', '-e'],
  ['--ignore', '-i'],
  ['--delay', '-d'],
  ['--max-wait', '-m'],
  ['--watch', '-w'],
  ['--exec', '-x']
];

/**
Long-only value flags.
*/
export const LONG_ONLY_VALUE_FLAGS: readonly string[] = ['--node-args', '--config'];

/**
Long value flags support `--flag=value`.
*/
export const LONG_VALUE_FLAGS: ReadonlySet<string> = new Set([
  ...VALUE_FLAG_PAIRS.map(([long]) => long),
  ...LONG_ONLY_VALUE_FLAGS
]);

/**
Short value flags never take `=` syntax.
*/
export const SHORT_VALUE_FLAGS: ReadonlySet<string> = new Set(
  VALUE_FLAG_PAIRS.map(([, short]) => short)
);

/**
Boolean runner flags (consume exactly one token).
*/
export const BOOL_FLAGS: ReadonlySet<string> = new Set([
  '-v',
  '-V',
  '--verbose',
  '-q',
  '--quiet',
  '--color',
  '--no-color'
]);

/**
Map a flag token to its canonical `FlagValues` key.
*/
function canonicalKey(flag: string): keyof FlagValues | undefined {
  switch (flag) {
    case '--ext':
    case '-e': {
      return 'ext';
    }
    case '--ignore':
    case '-i': {
      return 'ignore';
    }
    case '--delay':
    case '-d': {
      return 'delay';
    }
    case '--max-wait':
    case '-m': {
      return 'max-wait';
    }
    case '--watch':
    case '-w': {
      return 'watch';
    }
    case '--exec':
    case '-x': {
      return 'exec';
    }
    case '--node-args': {
      return 'node-args';
    }
    case '--config': {
      return 'config';
    }
    /* --verbose / --quiet are BOOL_FLAGS — they never reach this mapper,
       which only runs for value flags (guarded at both call sites). */
    /* v8 ignore start */
    default:
    /* v8 ignore end */
  }
  return undefined;
}

export function isValueFlag(token: string): boolean {
  return LONG_VALUE_FLAGS.has(token) || SHORT_VALUE_FLAGS.has(token);
}

export function isBoolFlag(token: string): boolean {
  return BOOL_FLAGS.has(token);
}

/**
FIRST occurrence wins — the legacy pull() semantics.
*/
function setValueOnce(values: FlagValues, key: keyof FlagValues, value: string): void {
  if (values[key] === undefined) {
    (values as unknown as Record<string, unknown>)[key] = value;
  }
}

/**
Scan argv into runner flags + script + verbatim app arguments_.
@param arguments_ full argument list (process.argv.slice(2) equivalent)
*/
export function parseInvocation(arguments_: string[]): ParsedInvocation {
  const values: FlagValues = { verbose: false, quiet: false };
  let scriptToken: string | null = null;
  let index = 0;

  while (index < arguments_.length) {
    const a = arguments_[index];
    if (a === undefined) {
      break;
    }
    if (a === '--') {
      /* nodemon-style explicit separator: the NEXT token is the script even
         if it looks like a flag, and nothing here is flag-parsed. */
      scriptToken = arguments_[index + 1] ?? null;
      index += 2;
      break;
    }
    const eq = /^(--[A-Za-z-]+)=([\s\S]*)$/u.exec(a);
    const flag = eq?.[1];
    const flagValue = eq?.[2];
    if (flag !== undefined && flagValue !== undefined && LONG_VALUE_FLAGS.has(flag)) {
      const key = canonicalKey(flag);
      if (key) {
        setValueOnce(values, key, flagValue);
      }
      index += 1;
      continue;
    }
    if (isValueFlag(a)) {
      const key = canonicalKey(a);
      if (key) {
        setValueOnce(values, key, arguments_[index + 1] ?? '');
      }
      index += 2;
      continue;
    }
    if (isBoolFlag(a)) {
      if (['-v', '-V', '--verbose'].includes(a)) {
        values.verbose = true;
      } else if (a === '-q' || a === '--quiet') {
        values.quiet = true;
      }
      /* --color / --no-color are resolved from the RAW argv afterwards
         (legacy quirk: even an app-arg occurrence after `--` counts). */
      index += 1;
      continue;
    }
    scriptToken = a;
    index += 1;
    break;
  }

  const afterScript = dropLeadingSeparator(arguments_.slice(index));
  values.color = resolveColorFlag(arguments_);
  return { values, scriptToken, afterScript };
}
