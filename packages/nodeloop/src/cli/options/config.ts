/**
`--config <file>` — explicit configuration file.

The option only RESOLVES the flag to an absolute path; existence and
parsing failures are reported by the start command (`config file not
found: <raw-flag>` with the supported-formats hint — legacy parity, the
message carries the RAW user input, not the resolved path).
*/
import path from 'node:path';

export interface ConfigOption {
  readonly name: '--config';
  /**
  @param cli raw flag value (undefined = absent, '' = empty)
  @param cwd working directory the path is resolved against
  @returns absolute config path, or undefined when the flag is absent/empty
  */
  resolve(cli: string | undefined, cwd: string): string | undefined;
}

export const configOption: ConfigOption = {
  name: '--config',
  resolve(cli, cwd) {
    return cli === undefined || cli === '' ? undefined : path.resolve(cwd, cli);
  }
};
