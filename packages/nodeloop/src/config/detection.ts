/**
Configuration detection — walk the fixed candidate list in the exact
documented order and return the first file that EXISTS. First match
wins; parsing happens later (a detected file that fails to parse is an
error naming that file, not a reason to try the next candidate).
*/
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILES } from './schema.js';

export { CONFIG_FILES } from './schema.js';

/**
@param cwd directory to scan (usually process.cwd())
@returns absolute path of the first existing config file, or null
*/
export function detectConfigFile(cwd: string): string | null {
  for (const name of CONFIG_FILES) {
    const file = path.join(cwd, name);
    if (fs.existsSync(file)) {
      return file;
    }
  }
  // The exported detection API documents null when no file matches.
  return null;
}
