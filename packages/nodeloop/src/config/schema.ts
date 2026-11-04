/**
The normalized runtime configuration shape — the single consistent shape
every loader's output is sanitized into (spec §7: "formats differ, the
final normalized runtime configuration has one consistent shape").

Mirrors exactly what `lib/config.js sanitize()` produces; unknown keys are
dropped into `unknownKeys`, mistyped known keys into `badKeys` (both are
warned about by the CLI, never crash).
*/
export interface NormalizedConfig {
  script?: string;
  scriptArgs?: string[];
  ext?: string;
  ignore?: string[];
  watch?: string | string[];
  delay?: number;
  maxWait?: number;
  verbose?: boolean;
  quiet?: boolean;
  killSignal?: string;
  killTimeout?: number;
  env?: Record<string, string>;
  exec?: string;
  nodeArgs?: string[];
  execMap?: Record<string, string>;
  restartable?: string | false;
  colours?: boolean;
  legacyWatch?: boolean | number;
  events?: Partial<Record<ConfigEventName, string>>;
}

/**
The lifecycle messages a config's `events` object may override.
*/
export type ConfigEventName = 'start' | 'restart' | 'crash' | 'exit' | 'quit';

/**
A parsed-but-unsanitized configuration object (whatever a loader returned).
*/
export type RawConfig = Record<string, unknown>;

/**
Result of loading + sanitizing one configuration source.
*/
export interface ConfigLoadResult {
  config: NormalizedConfig;
  /**
  Absolute path of the file the config came from (null = no file found).
  */
  file: string | null | undefined;
  unknownKeys: string[];
  badKeys: string[];
  error: Error | null | undefined;
}

/**
The auto-detection order — first match wins. Spec §4, identical to legacy.
*/
export const CONFIG_FILES: readonly string[] = [
  'nodeloop.json',
  '.nodelooprc',
  'nodeloop.toml',
  'nodeloop.yaml',
  'nodeloop.yml',
  'nodeloop.js',
  'nodeloop.mjs',
  'nodeloop.ts',
  'nodeloop.mts'
];

/**
Every recognized configuration key (incl. nodemon-style aliases).
*/
export const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'script',
  'scriptArgs',
  'args',
  'ext',
  'ignore',
  'watch',
  'delay',
  'maxWait',
  'verbose',
  'quiet',
  'killSignal',
  'signal',
  'killTimeout',
  'env',
  'exec',
  'nodeArgs',
  'execMap',
  'restartable',
  'colours',
  'colors',
  'legacyWatch',
  'events'
]);

/**
The events sub-object keys nodeloop can override.
*/
export const EVENT_KEYS: ReadonlySet<string> = new Set([
  'start',
  'restart',
  'crash',
  'exit',
  'quit'
]);
