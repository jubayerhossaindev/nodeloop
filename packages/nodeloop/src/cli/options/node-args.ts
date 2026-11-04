/**
`--node-args` — extra arguments for node itself (e.g. `--inspect`).

The CLI value is a single STRING that is tokenized with the quote-aware
`tokenizeCommand` (paths with spaces survive: `--node-args "--eval 1"`).
The config `nodeArgs` key is already a string array from the loader.
*/
import type { NormalizedConfig } from '../../config/schema.js';
import { tokenizeCommand } from '../../runtime/command.js';

export interface NodeArgumentsOption {
  readonly name: '--node-args';
  merge(cli: string | undefined, config: NormalizedConfig): string[];
}

export const nodeArgumentsOption: NodeArgumentsOption = {
  name: '--node-args',
  merge(cli, config) {
    return cli ? tokenizeCommand(cli) : (config.nodeArgs ?? []);
  }
};

/**
Short alias for `nodeArgumentsOption`.
*/
export const nodeArgsOption = nodeArgumentsOption;
