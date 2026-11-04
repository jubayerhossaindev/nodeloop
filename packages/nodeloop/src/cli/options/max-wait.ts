/**
`-m` / `--max-wait` — force a restart during endless change bursts (ms).

Merge rule (legacy parity): `maxWaitFlag || config.maxWait || undefined`;
`0` means disabled. The runtime layer applies `positive(value, 0)`.
*/
import type { NormalizedConfig } from '../../config/schema.js';
import type { NumericOptionValue } from './delay.js';

export interface MaxWaitOption {
  readonly name: '--max-wait';
  readonly short: '-m';
  merge(cli: string | undefined, config: NormalizedConfig): NumericOptionValue;
}

export const maxWaitOption: MaxWaitOption = {
  name: '--max-wait',
  short: '-m',
  merge(cli, config) {
    return cli || config.maxWait || undefined;
  }
};
