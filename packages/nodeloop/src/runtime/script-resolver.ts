/**
Script resolution — the DEFAULT chain, ported exactly from cli.js.

When neither the CLI nor the config names a script, the defaults fill in:
  1. `package.json` `"main"` field (project dir)
  2. `index.js`
  3. `server.js`

nodeloop NEVER invents commands from package.json `"scripts"` — to run a
dev server, set config `"exec"` (e.g. "npm run dev") and leave `script`
unset. When the chain exhausts AND no exec is configured, the caller
raises NoScriptError with the config-aware hint.
*/
import fs from 'node:fs';
import path from 'node:path';
import { NoScriptError } from '../errors/types.js';

/**
Walk the default chain in cwd.
@param cwd project directory
@returns the default script, or null when nothing matched
*/
export function resolveScriptChain(cwd: string): string | null {
  const packagePath = path.join(cwd, 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      const package_ = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { main?: unknown };
      if (typeof package_.main === 'string' && package_.main) {
        return package_.main;
      }
    } catch {
      /*
      broken package.json — not our problem here, ignore
      */
    }
  }
  if (fs.existsSync(path.join(cwd, 'index.js'))) {
    return 'index.js';
  }
  if (fs.existsSync(path.join(cwd, 'server.js'))) {
    return 'server.js';
  }
  if (fs.existsSync(path.join(cwd, 'app.js'))) {
    return 'app.js';
  }
  return null;
}

/**
Full resolution: CLI token → config "script" → default chain.
@param scriptToken raw script from the option layer (or null)
@param configScript sanitized config `script` (or undefined)
@param cwd working directory for the default chain
*/
export function resolveScript(
  scriptToken: string | null,
  configScript: string | undefined,
  cwd: string
): string | null {
  if (scriptToken) {
    return scriptToken;
  }
  if (configScript) {
    return configScript;
  }
  return resolveScriptChain(cwd);
}

/**
Build the "no script given and none found" hint — config-aware, exactly
like the legacy fatal(): a loaded config file gets told to add
"script"/"exec" to ITSELF; without a config the generic guidance shows.

@param configLabel relative config path as displayed, or null (no config)
@returns the hint string (styling is the renderer's job)
*/
export function noScriptHint(configLabel: string | null): string {
  return configLabel
    ? `${configLabel} loaded, but it has no "script" or "exec" key — add "exec": "npm run dev" (or "script": "app.js") to it ` +
        `· or nodeloop --exec "npm run dev" · nodeloop --help`
    : 'set "script" (entry file) or "exec" (command, e.g. "npm run dev") in a config file ' +
        '· or nodeloop app.js · nodeloop --help';
}

/**
Raise the no-script failure (callers catch NodeloopError and render it).
@param hasExec whether an exec command is configured (exec-only runs pass)
@param configLabel displayed config path or null
@throws NoScriptError when there is neither a script nor an exec
*/
export function requireScriptOrExec(
  hasExec: boolean,
  configLabel: string | null | undefined = null
): void {
  if (!hasExec) {
    throw new NoScriptError(noScriptHint(configLabel));
  }
}
