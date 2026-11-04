/**
`--color` / `--no-color` — force the terminal palette on/off.

Precedence note: the flag beats the config `colours` key, which beats the
environment (NO_COLOR / FORCE_COLOR / TTY detection). When neither flag is
present the result is `undefined` = "auto", letting config + env decide.

Legacy quirk preserved: detection runs over the RAW argv, so a literal
`--color` token in the app args (after the script) still counts — exactly
what `argv.includes('--color')` did in cli.js.
*/

/**
`--color` → true; `--no-color` → false; neither → undefined (auto).
*/
export function resolveColorFlag(arguments_: string[]): boolean | undefined {
  if (arguments_.includes('--color')) {
    return true;
  }
  if (arguments_.includes('--no-color')) {
    return false;
  }
  return undefined;
}
