/**
`-v` / `-V` / `--verbose` — detailed restart diagnostics.

Boolean merge (legacy parity): the flag ORs with
`config.verbose === true`. All three aliases behave identically.
*/
import type { NormalizedConfig } from '../../config/schema.js';

export interface VerboseOption {
  readonly name: '--verbose';
  readonly shorts: readonly ['-v', '-V'];
  merge(isCli: boolean, config: NormalizedConfig): boolean;
}

export const verboseOption: VerboseOption = {
  name: '--verbose',
  shorts: ['-v', '-V'],
  merge(isCli, config) {
    return isCli || config.verbose === true;
  }
};
