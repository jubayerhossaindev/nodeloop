/**
The nodemon-style `--` separator.

Two behaviors from the legacy parser (cli.js runnerMode):
  1. A `--` BEFORE the script forces the NEXT token to be the script even
     if it looks like a flag, and stops flag parsing entirely.
     (Implemented in parser.ts — this module owns the rule's constants.)
  2. A `--` immediately AFTER the script is consumed and NOT passed to
     the app: "the separator itself is not an app arg".
*/
export const SEPARATOR = '--';

/**
Drop the leading `--` from the verbatim app args (nodemon parity).
@param afterScript raw tokens after the script token
@returns app args with a leading separator removed
*/
export function dropLeadingSeparator(afterScript: string[]): string[] {
  return afterScript[0] === SEPARATOR ? afterScript.slice(1) : afterScript;
}
