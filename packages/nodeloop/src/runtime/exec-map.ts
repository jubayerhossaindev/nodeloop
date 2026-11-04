/**
execMap resolution — extension → runner command (nodemon parity).

Consulted ONLY when no explicit exec was given via CLI --exec or config
"exec" — those always win. Keys are normalized by the config loader
("ts"/"TS" → "ts"); lookup uses the script's lowercased extension.
*/
import path from 'node:path';
import { extensionNameLower } from '../utils/paths.js';

export interface ExecMapResult {
  /**
  The mapped command, or undefined when no mapping applies.
  */
  cmd: string | undefined;
  /**
  True only when a mapping is the ACTUAL runner (drives the verbose box row).
  */
  used: boolean;
}

/**
Look up the runner command for a script's extension.
@param execMap    sanitized execMap (keys already normalized)
@param scriptPath absolute script path (null for exec-only runs)
*/
export function resolveExecMap(
  execMap: Record<string, string> | undefined,
  scriptPath: string | null | undefined
): ExecMapResult {
  if (!execMap || !scriptPath) {
    return { cmd: undefined, used: false };
  }
  const scriptExtension = extensionNameLower(scriptPath);
  if (!scriptExtension) {
    return { cmd: undefined, used: false };
  }
  const mapped = execMap[scriptExtension];
  return typeof mapped === 'string' && mapped.trim()
    ? { cmd: mapped.trim(), used: true }
    : { cmd: undefined, used: false };
}

/**
Convenience: the extension used for the lookup (exported for tests).
*/
export function scriptExtensionForExecMap(scriptPath: string): string {
  return path.extname(scriptPath).slice(1).toLowerCase();
}

/**
Short alias for `scriptExtensionForExecMap`.
*/
export const scriptExtForExecMap = scriptExtensionForExecMap;
