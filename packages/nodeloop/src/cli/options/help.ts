/**
`-h` / `--help` — the only "command" the runner accepts; it short-circuits
before any config is read (legacy parity: checked before runnerMode).
*/
export const HELP_FLAGS: readonly string[] = ['-h', '--help'];

/**
Any position counts — same `argv.includes` semantics as the legacy CLI.
*/
export function isHelpRequested(arguments_: string[]): boolean {
  return arguments_.includes('-h') || arguments_.includes('--help');
}
