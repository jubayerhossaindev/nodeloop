/**
Options module barrel — parsing, per-flag merges and the effective
option set. Every CLI option lives in its own file (spec §6) and is
re-exported here for the command layer.
*/
import type { FlagValues, ParsedInvocation } from './types.js';
import type { NormalizedConfig } from '../../config/schema.js';

import { extensionOption } from './ext.js';
import { ignoreOption } from './ignore.js';
import { watchOption } from './watch.js';
import { delayOption, type NumericOptionValue } from './delay.js';
import { maxWaitOption } from './max-wait.js';
import { execOption } from './exec.js';
import { nodeArgumentsOption } from './node-args.js';
import { configOption } from './config.js';
import { verboseOption } from './verbose.js';
import { quietOption } from './quiet.js';
import { scriptOption } from './script.js';

export type { FlagValues, ParsedInvocation } from './types.js';
export { SEPARATOR, dropLeadingSeparator } from './separator.js';
export {
  parseInvocation,
  VALUE_FLAG_PAIRS,
  LONG_ONLY_VALUE_FLAGS,
  LONG_VALUE_FLAGS,
  SHORT_VALUE_FLAGS,
  BOOL_FLAGS,
  parseInvocation as parse
} from './parser.js';
export { extensionOption as extOption, type ExtensionOption as ExtOption } from './ext.js';
export { ignoreOption, type IgnoreOption } from './ignore.js';
export { watchOption, type WatchOption } from './watch.js';
export { delayOption, type DelayOption, type NumericOptionValue } from './delay.js';
export { maxWaitOption, type MaxWaitOption } from './max-wait.js';
export { execOption, type ExecOption } from './exec.js';
export {
  nodeArgumentsOption as nodeArgsOption,
  type NodeArgumentsOption as NodeArgsOption
} from './node-args.js';
export { configOption, type ConfigOption } from './config.js';
export { verboseOption, type VerboseOption } from './verbose.js';
export { quietOption, type QuietOption } from './quiet.js';
export { scriptOption, type ScriptOption } from './script.js';
export { HELP_FLAGS, isHelpRequested } from './help.js';
export { VERSION_FLAGS, isVersionRequested } from './version.js';
export { validateScript, scriptExtension, LAG_COMMAND, type ValidatedScript } from './validator.js';
export { resolveColorFlag } from './color.js';

/**
The effective option set after applying **CLI flags > config > defaults**
against a sanitized config. This is what the start command feeds into the
runtime layer.
*/
export interface EffectiveOptions {
  ext: string | undefined;
  /**
  CLI --ignore EXTENDS the config ignore list (unique among the flags).
  */
  ignore: string[];
  delay: NumericOptionValue;
  maxWait: NumericOptionValue;
  watch: string | string[] | undefined;
  exec: string | undefined;
  nodeArgs: string[];
  verbose: boolean;
  quiet: boolean;
  /**
  true / false / undefined (auto) — beats config `colours`, loses to nothing.
  */
  color: boolean | undefined;
  /**
  Raw script token: CLI arg ?? config.script ?? null (chain comes later).
  */
  scriptToken: string | null | undefined;
  /**
  Verbatim app args, or config.scriptArgs when the CLI gave none.
  */
  scriptArgs: string[];
  /**
  Absolute config path from --config (undefined = auto-detect).
  */
  configPath: string | undefined;
  /**
  Raw --config flag value — used verbatim in the not-found message.
  */
  configFlagRaw: string | undefined;
}

/**
Merge a parsed invocation with a sanitized config.
@param parsed  result of parseInvocation()
@param config  sanitized configuration (NormalizedConfig)
@param cwd     working directory (for --config resolution)
*/
export function resolveOptions(
  parsed: ParsedInvocation,
  config: NormalizedConfig,
  cwd: string
): EffectiveOptions {
  const v: FlagValues = parsed.values;
  return {
    ext: extensionOption.merge(v.ext, config),
    ignore: ignoreOption.merge(v.ignore, config),
    delay: delayOption.merge(v.delay, config),
    maxWait: maxWaitOption.merge(v['max-wait'], config),
    watch: watchOption.merge(v.watch, config),
    exec: execOption.merge(v.exec, config),
    nodeArgs: nodeArgumentsOption.merge(v['node-args'], config),
    verbose: verboseOption.merge(v.verbose, config),
    quiet: quietOption.merge(v.quiet, config),
    color: v.color,
    scriptToken: scriptOption.merge(parsed.scriptToken, config),
    scriptArgs: parsed.afterScript.length > 0 ? parsed.afterScript : (config.scriptArgs ?? []),
    configPath: configOption.resolve(v.config, cwd),
    configFlagRaw: v.config
  };
}
