/**
Loader dispatcher — routes ONE config file to the right parser by
extension/basename. Exact port of `lib/config.js readConfigFile`, with
the loaders split into their own modules (spec §7: "parsing differs per
format, the normalized shape does not").
*/
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonWithBom } from './json.js';
import { parseTOML } from './toml.js';
import { parseYAML } from './yaml.js';
import { loadJsTsConfig } from './javascript.js';
import { loadEsmConfig } from './esm.js';
import { loadTypeScriptConfig } from './typescript.js';
import { loadMtsConfig } from './mts.js';

export { stripBOM, parseJsonWithBom } from './json.js';
export { parseRc } from './rc.js';
export {
  parseTOML,
  parseTOMLValue,
  parseQuoted,
  splitTop,
  stripComment,
  unquoteTOMLKey
} from './toml.js';
export { parseYAML, parseYAMLValue } from './yaml.js';
export { loadJsTsConfig, jsTsHint } from './javascript.js';
export { loadEsmConfig } from './esm.js';
export { loadTypeScriptConfig } from './typescript.js';
export { loadMtsConfig } from './mts.js';
export { loadPackageJsonConfig } from './package-json.js';

/**
Read ONE config file and return its raw object.
@param file absolute or cwd-relative path to an existing config file
@throws on unsupported types, parse errors and JS/TS load failures
*/
export function readConfigFile(file: string): Record<string, unknown> {
  const read = (): string => fs.readFileSync(file, 'utf8');
  const extension = path.extname(file).toLowerCase();

  if (extension === '.json' || path.basename(file) === '.nodelooprc') {
    return parseJsonWithBom(read());
  }
  if (extension === '.toml') {
    return parseTOML(read());
  }
  if (extension === '.yaml' || extension === '.yml') {
    return parseYAML(read());
  }
  if (extension === '.js' || extension === '.cjs') {
    // .js/.cjs: CommonJS (or ESM when the nearest package.json says "module"
    // — Node's own rule, and the loader's hints explain both).
    return loadJsTsConfig(file) as Record<string, unknown>;
  }
  if (extension === '.mjs') {
    return loadEsmConfig(file) as Record<string, unknown>;
  }
  if (extension === '.ts') {
    return loadTypeScriptConfig(file) as Record<string, unknown>;
  }
  if (extension === '.mts') {
    return loadMtsConfig(file) as Record<string, unknown>;
  }
  throw new Error(`unsupported config file type: ${file}`);
}
