/**
`nodeloop.mts` loader — always ESM TypeScript. Delegates to the shared
JS/TS implementation (Node ≥ 22.12/22.18 rules apply).
*/
import { loadJsTsConfig } from './javascript.js';

/**
Load a `nodeloop.mts` config module.
*/
export function loadMtsConfig(file: string): unknown {
  return loadJsTsConfig(file);
}
