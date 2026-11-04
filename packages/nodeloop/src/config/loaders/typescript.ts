/**
`nodeloop.ts` loader — type-stripped by Node ≥ 22.18 via require(); on
older Node the extension error gets the dedicated `.ts` hint. Delegates
to the shared JS/TS implementation.
*/
import { loadJsTsConfig } from './javascript.js';

/**
Load a `nodeloop.ts` config module.
*/
export function loadTypeScriptConfig(file: string): unknown {
  return loadJsTsConfig(file);
}
