/**
`-q` / `--quiet` — suppress every nodeloop-owned line (banners, restart
notices, warnings). NEVER suppresses the child's own stdout/stderr.

Boolean merge (legacy parity): the flag ORs with `config.quiet === true`.
*/
import type { NormalizedConfig } from '../../config/schema.js';

export interface QuietOption {
  readonly name: '--quiet';
  readonly shorts: readonly ['-q'];
  merge(isCli: boolean, config: NormalizedConfig): boolean;
}

export const quietOption: QuietOption = {
  name: '--quiet',
  shorts: ['-q'],
  merge(isCli, config) {
    return isCli || config.quiet === true;
  }
};
