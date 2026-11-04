/**
`.nodelooprc` loader — JSON with BOM tolerance (same parser as
nodeloop.json; only the detection name differs).
*/
import { parseJsonWithBom } from './json.js';

/**
Parse a `.nodelooprc` file body.
*/
export function parseRc(text: string): Record<string, unknown> {
  return parseJsonWithBom(text);
}
