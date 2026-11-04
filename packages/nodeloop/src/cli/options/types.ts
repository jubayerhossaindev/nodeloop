/**
Shared types for the CLI option layer. The parser produces `FlagValues`
straight from argv; each option module then merges its flag with the
(already sanitized) config values under the precedence rule
**CLI flags > configuration > built-in defaults**.
*/

/**
Raw values straight out of argv — one entry per supported flag.
*/
export interface FlagValues {
  ext?: string;
  ignore?: string;
  delay?: string;
  'max-wait'?: string;
  watch?: string;
  exec?: string;
  'node-args'?: string;
  config?: string;
  verbose: boolean;
  quiet: boolean;
  /**
  true = --color, false = --no-color, undefined = auto-detect
  */
  color?: boolean | undefined;
}

/**
Result of scanning argv with the nodemon-style runner rules.
*/
export interface ParsedInvocation {
  values: FlagValues;
  /**
  The script token — first non-flag token, or the token forced by `--`.
  */
  scriptToken: string | null | undefined;
  /**
  Everything after the script, verbatim (leading `--` already dropped).
  */
  afterScript: string[];
}
