/**
`-i` / `--ignore` — ignore specific directory names.

UNIQUE merge rule (legacy parity): the CLI flag EXTENDS the config list
instead of replacing it — every other flag replaces. Empty CLI entries are
trimmed away; the config entries always come first.
*/
import type { NormalizedConfig } from '../../config/schema.js';

export interface IgnoreOption {
  readonly name: '--ignore';
  readonly short: '-i';
  merge(cli: string | undefined, config: NormalizedConfig): string[];
}

export const ignoreOption: IgnoreOption = {
  name: '--ignore',
  short: '-i',
  merge(cli, config) {
    const fromConfig = Array.isArray(config.ignore) ? config.ignore : [];
    const fromCli = cli
      ? cli
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    return [...fromConfig, ...fromCli];
  }
};
