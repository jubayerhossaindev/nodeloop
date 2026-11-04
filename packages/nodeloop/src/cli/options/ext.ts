/**
`-e` / `--ext` — extensions to watch.

Merge rule (legacy parity): the CLI flag REPLACES the config value when
present, but an EMPTY flag value (`--ext ""` or flag-at-end) falls through
to the config — the legacy `extFlag || config.ext || undefined` chain.
*/
import type { NormalizedConfig } from '../../config/schema.js';

export interface ExtensionOption {
  readonly name: '--ext';
  readonly short: '-e';
  /**
  @param cli     raw flag value (undefined = flag absent, '' = empty)
  @param config  sanitized config (ext is already a comma-joined string)
  @returns effective extension list, or undefined for the default
  */
  merge(cli: string | undefined, config: NormalizedConfig): string | undefined;
}

export const extensionOption: ExtensionOption = {
  name: '--ext',
  short: '-e',
  merge(cli, config) {
    const fromConfig = typeof config.ext === 'string' ? config.ext : undefined;
    return cli || fromConfig || undefined;
  }
};

/**
Short alias for `extensionOption`.
*/
export const extOption = extensionOption;
