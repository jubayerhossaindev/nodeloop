/**
`--version` — print `[nodeloop] <version>` and exit 0.
The version is always read from package.json — never hardcoded.
*/
export const VERSION_FLAGS: readonly string[] = ['--version'];

/**
Any position counts — same `argv.includes` semantics as the legacy CLI.
*/
export function isVersionRequested(arguments_: string[]): boolean {
  return arguments_.includes('--version');
}
