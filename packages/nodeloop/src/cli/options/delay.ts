/**
`-d` / `--delay` — restart debounce window (ms).

Merge rule (legacy parity): `delayFlag || config.delay || undefined`.
The raw value stays a `string | number` — the runtime layer applies
`positive()` (finite and > 0, default 200) exactly like the legacy
Watcher constructor did.
*/
import type { NormalizedConfig } from '../../config/schema.js';

export type NumericOptionValue = string | number | undefined;

export interface DelayOption {
  readonly name: '--delay';
  readonly short: '-d';
  merge(cli: string | undefined, config: NormalizedConfig): NumericOptionValue;
}

export const delayOption: DelayOption = {
  name: '--delay',
  short: '-d',
  merge(cli, config) {
    return cli || config.delay || undefined;
  }
};
