/**
Argument assembly — which arguments reach the child after the script.

Legacy parity (cli.js): args after the script go to the app VERBATIM;
when the CLI gave none, config `scriptArgs` is used instead. The `--`
separator was already consumed by the option layer.
*/

/**
@param afterScript verbatim tokens collected after the script token
@param configScriptArguments sanitized config `scriptArgs`
@returns the argument list for the child
*/
export function resolveScriptArguments(
  afterScript: string[],
  configScriptArguments: string[] | undefined
): string[] {
  return afterScript.length > 0 ? afterScript : (configScriptArguments ?? []);
}

/**
Short alias for `resolveScriptArguments`.
*/
export const resolveScriptArgs = resolveScriptArguments;
