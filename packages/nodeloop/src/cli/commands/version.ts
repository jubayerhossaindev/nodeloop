/**
`nodeloop --version` — print `[nodeloop] <version>` and exit 0.
The version ALWAYS comes from package.json (banner contract).
*/
import type { UI } from '../../terminal/ui.js';

function print(s: string): void {
  process.stdout.write(`${s}\n`);
}

/**
Print the version banner to stdout; returns the exit code (0).
*/
export function runVersion(ui: UI, version: string, write: (s: string) => void = print): number {
  write(ui.banner(version));
  return 0;
}
