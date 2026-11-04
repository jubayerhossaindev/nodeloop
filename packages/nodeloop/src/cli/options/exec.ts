/**
`-x` / `--exec` — custom execution command ("tsx", "npm run dev", …).

Merge rule (legacy parity): CLI replaces config; empty falls through.
May contain arguments; tokenization is quote-aware and happens in the
runtime layer (`resolveSpawn`), not here.
*/
import type { NormalizedConfig } from '../../config/schema.js';

export interface ExecOption {
  readonly name: '--exec';
  readonly short: '-x';
  merge(cli: string | undefined, config: NormalizedConfig): string | undefined;
}

export const execOption: ExecOption = {
  name: '--exec',
  short: '-x',
  merge(cli, config) {
    return cli || config.exec || undefined;
  }
};
