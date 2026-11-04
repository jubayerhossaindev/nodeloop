/**
Nodemon-style key aliases — first-class compatibility, NOT unknown keys.

| alias   | canonical   | note                                   |
|---------|-------------|----------------------------------------|
| `args`  | `scriptArgs`| nodemon's argument list key            |
| `signal`| `killSignal`| nodemon's restart-kill signal          |
| `colors`| `colours`   | US spelling of the palette switch      |

When both the alias and the canonical key appear, the LAST one in object
order wins (identical to the legacy `sanitize()` switch, which simply
wrote the same `values` slot twice).
*/
import type { KeyParser } from './types.js';
import { parseScriptArguments } from './execution.js';
import { parseKillSignal } from './process.js';
import { parseColours } from './terminal.js';

/**
alias key → the parser that handles its canonical meaning.
*/
export const ALIAS_PARSERS: Readonly<Record<string, KeyParser>> = {
  args: parseScriptArguments,
  colors: parseColours,
  signal: parseKillSignal
};
