/**
`nodeloop --help` — print the help screen and exit 0.
The version is passed in (read from package.json — never hardcoded).
*/
import type { UI } from '../../terminal/ui.js';

function print(s: string): void {
  process.stdout.write(`${s}\n`);
}

/**
Print help to stdout; returns the exit code (0).
*/
export function renderHelp(ui: UI, version: string): string {
  return ui.help(version);
}

export function runHelp(ui: UI, version: string, write: (s: string) => void = print): number {
  write(renderHelp(ui, version));
  return 0;
}
