/**
Child-process environment assembly — extra config `env` values merged
OVER process.env (config wins for the keys it sets; everything else is
inherited untouched).
*/
import type { NormalizedConfig } from '../config/schema.js';

/**
@param configEnvironment sanitized config `env` (already stringified by the loader)
@param base      base environment (defaults to process.env for realism;
                 injectable for deterministic tests)
*/
export function buildEnvironment(
  configEnvironment: NormalizedConfig['env'],
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return { ...base, ...configEnvironment };
}

/**
Short alias for `buildEnvironment`.
*/
export const buildEnv = buildEnvironment;
