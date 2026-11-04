/**
nodeloop — public API surface.

The TypeScript implementation exposes the SAME building blocks the
legacy JavaScript package exported (Watcher → NativeWatcher, loadConfig,
forwardStdin, the normalizers) plus the fully typed option/config/terminal
layers. Legacy entry points (packages at the repo root) remain untouched;
this is the migrated surface.
*/

/*
config
*/
export { loadConfig, loadConfigFile } from './config/resolver.js';
export { sanitizeConfig, KEY_PARSERS, type SanitizeResult } from './config/validator.js';
export { readConfigFile } from './config/loaders/index.js';
export { parseTOML, parseYAML } from './config/loaders/index.js';
export { detectConfigFile, CONFIG_FILES } from './config/detection.js';
export {
  CONFIG_FILES as configFiles,
  KNOWN_KEYS,
  EVENT_KEYS,
  type NormalizedConfig,
  type ConfigLoadResult,
  type ConfigEventName,
  type RawConfig
} from './config/schema.js';
export {
  DEFAULT_EXTS,
  DEFAULT_IGNORES,
  DEFAULT_DELAY,
  DEFAULT_MAX_WAIT,
  DEFAULT_KILL_SIGNAL,
  DEFAULT_KILL_TIMEOUT,
  DEFAULT_RESTARTABLE
} from './config/defaults.js';

/*
cli options
*/
export {
  parseInvocation,
  resolveOptions,
  isHelpRequested,
  isVersionRequested,
  resolveColorFlag,
  dropLeadingSeparator,
  SEPARATOR,
  validateScript,
  LAG_COMMAND,
  type ParsedInvocation,
  type FlagValues,
  type EffectiveOptions,
  type ValidatedScript
} from './cli/options/mod.js';

/*
runtime
*/
export {
  tokenizeCommand,
  winQuote,
  resolveSpawn,
  isExecutableFile,
  type SpawnSpec,
  type ResolveSpawnOptions
} from './runtime/command.js';
export {
  resolveScript,
  resolveScriptChain,
  noScriptHint,
  requireScriptOrExec
} from './runtime/script-resolver.js';
export {
  resolveExecMap,
  scriptExtensionForExecMap,
  type ExecMapResult
} from './runtime/exec-map.js';
export { buildEnvironment } from './runtime/environment.js';
export { resolveScriptArguments } from './runtime/arguments.js';
export {
  positive,
  normalizeExtensions,
  normalizePollInterval,
  normalizeIgnores,
  normalizeWatchPaths
} from './runtime/normalize.js';
export {
  ShutdownCoordinator,
  type ShutdownResult,
  type StoppableWatcher
} from './runtime/lifecycle.js';

/*
interactive
*/
export { restartMatcher, DEFAULT_RESTART_WORDS } from './interactive/restart-command.js';
export {
  forwardStdin,
  type ForwardStdinOptions,
  type StdinForwarder,
  type StdinTarget
} from './interactive/stdin.js';
export {
  shouldInterceptStdin,
  restartWord,
  type InteractiveStdinOptions
} from './interactive/terminal-handoff.js';

/*
terminal
*/
export { createUI, type UI, type CreateUIOptions } from './terminal/ui.js';
export {
  isDetectColor as detectColor,
  detectColorLevel,
  isDetectUnicode as detectUnicode,
  type DetectableStream,
  type DetectEnvironment as DetectEnv
} from './terminal/detection.js';
export {
  nearest256,
  PALETTE,
  STYLE_ALIASES,
  stripAnsi,
  type PaletteEntry
} from './terminal/colors.js';
export { SYM_UNICODE, SYM_ASCII, getSymbols, type Symbols } from './terminal/icons.js';
export { createStyles, hhmmss, BRAND } from './terminal/renderer.js';

/*
native bridge
*/
export { loadNativeBinding, isNativeAvailable, platformPackageName } from './native/loader.js';
export {
  NativeWatcher,
  type NativeWatcherOptions,
  type WatcherDisplayFields,
  type WatcherEventMap
} from './native/client.js';
export type {
  NativeBinding,
  NativeModule,
  NativeEvent,
  NativeWatchConfig
} from './native/types.js';
export { NativeLoadError, NativeContractError, NativeOperationError } from './native/errors.js';

/*
errors
*/
export {
  NodeloopError,
  ConfigFileNotFoundError,
  InvalidConfigError,
  NoScriptError,
  ScriptNotFoundError,
  ScriptIsDirectoryError
} from './errors/types.js';
export { MESSAGES } from './errors/messages.js';

/*
process guard
*/
export { isChildProcessAlive } from './cli/commands/process-guard.js';
