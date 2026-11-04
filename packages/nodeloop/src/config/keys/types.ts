import type { NormalizedConfig } from '../schema.js';

/**
Shared result type for configuration-key parsers. Every key module in
`keys/` returns this — `ok: true` carries the partial config to merge;
`ok: false` pushes the key into `badKeys` (warned, then defaulted).
*/
export type KeyParseResult = { ok: true; set: Partial<NormalizedConfig> } | { ok: false };

export type KeyParser = (value: unknown) => KeyParseResult;
