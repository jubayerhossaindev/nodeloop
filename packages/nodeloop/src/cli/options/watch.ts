/**
`-w` / `--watch` — restrict watching to these path prefixes.

Merge rule (legacy parity): CLI replaces config; empty falls through.
The raw value is kept as given — `normalizeWatchPaths` in the runtime
layer does the `./`, trailing-slash and absolute-path normalization.
*/
import type { NormalizedConfig } from '../../config/schema.js';

export interface WatchOption {
  readonly name: '--watch';
  readonly short: '-w';
  merge(cli: string | undefined, config: NormalizedConfig): string | string[] | undefined;
}

export const watchOption: WatchOption = {
  name: '--watch',
  short: '-w',
  merge(cli, config) {
    /* legacy parity (cli.js:177): `watchFlag || config.watch` — a config
       watch may be a string OR a string array; both pass through raw and
       are normalized by the runtime layer. Empty arrays fall through. */
    let fromConfig: string | string[] | undefined;
    if (Array.isArray(config.watch)) {
      fromConfig = config.watch.length > 0 ? config.watch : undefined;
    } else {
      fromConfig = config.watch;
    }
    return cli || fromConfig || undefined;
  }
};
