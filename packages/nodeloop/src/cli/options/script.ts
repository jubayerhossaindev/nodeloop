/**
Script selection — the RAW script token only.

Precedence (legacy parity): CLI argument wins, then config `script`.
The DEFAULT chain (package.json "main" → index.js → server.js) is the
runtime layer's `resolveScriptChain` and only fills what is missing.
nodeloop NEVER invents commands from package.json "scripts".
*/
import type { NormalizedConfig } from '../../config/schema.js';

export interface ScriptOption {
  readonly name: '<script>';
  merge(cli: string | null | undefined, config: NormalizedConfig): string | null | undefined;
}

export const scriptOption: ScriptOption = {
  name: '<script>',
  merge(cli: string | null | undefined, config: NormalizedConfig): string | null | undefined {
    if (cli) {
      return cli;
    }
    if (config.script) {
      return config.script;
    }
    // The option contract uses null for an absent script token.
    return null;
  }
};
