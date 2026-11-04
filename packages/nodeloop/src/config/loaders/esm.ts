/**
`nodeloop.mjs` loader — always ESM, require()-loaded like the legacy
loader (Node ≥ 22.12 accepts ESM via require; older Node throws and the
loader attaches the always-ESM hint). Delegates to the shared JS/TS
implementation — one behavior, one code path.
*/
import { loadJsTsConfig } from './javascript.js';

/**
Load a `nodeloop.mjs` config module.
*/
export function loadEsmConfig(file: string): unknown {
  return loadJsTsConfig(file);
}
