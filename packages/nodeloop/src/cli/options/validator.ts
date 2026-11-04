/**
Invocation validator — the checks the legacy `runnerMode()` performed
AFTER the option merge, before spawning anything. Failures are typed
errors; the start command renders them (fatal line + hint, exit 1).
*/
import fs from 'node:fs';
import path from 'node:path';
import { NodeloopError, ScriptIsDirectoryError, ScriptNotFoundError } from '../../errors/types.js';
import { MESSAGES } from '../../errors/messages.js';
import { extensionNameLower } from '../../utils/paths.js';

/**
The special-cased `nodeloop lag` — no lag subcommand/monitor exists and
the message says so explicitly instead of a bare ENOENT.
*/
export const LAG_COMMAND = 'lag';

export interface ValidatedScript {
  /**
  Absolute path to the script (null for exec-only runs).
  */
  scriptPath: string | null | undefined;
  /**
  True when the script exists and is a directory.
  */
  isDirectory: boolean;
}

/**
Validate a resolved script path the way cli.js did:
  1. missing file → ScriptNotFoundError (lag gets the dedicated wording);
  2. directory without index.js/package.json inside → ScriptIsDirectoryError.

@param script     raw script token as given (used in messages)
@param scriptPath absolute path, or null for exec-only runs
@param cwd        working directory (used for the directory-entry checks)
*/
export function validateScript(
  script: string | null | undefined,
  scriptPath: string | null | undefined,
  _cwd: string
): ValidatedScript {
  if (!scriptPath) {
    return { scriptPath: undefined, isDirectory: false };
  }

  if (!fs.existsSync(scriptPath)) {
    if (script === LAG_COMMAND) {
      /* no lag subcommand exists — say so explicitly instead of a bare
         ENOENT, with the full legacy wording */
      throw new NodeloopError(
        MESSAGES.lagNotSupported,
        'to run your app: nodeloop app.js · or nodeloop --help'
      );
    }
    throw new ScriptNotFoundError(
      script ?? scriptPath,
      'run from your project directory, or check the path — e.g. nodeloop server.js'
    );
  }

  let isDirectory = false;
  try {
    isDirectory = fs.statSync(scriptPath).isDirectory();
  } catch {
    /*
    gone between existsSync and stat — treat as a file
    */
  }

  if (
    isDirectory &&
    !fs.existsSync(path.join(scriptPath, 'index.js')) &&
    !fs.existsSync(path.join(scriptPath, 'package.json'))
  ) {
    throw new ScriptIsDirectoryError(script ?? scriptPath);
  }

  return { scriptPath, isDirectory };
}

/**
The extension of the script for execMap lookups (`.TS` → `ts`).
Exported for completeness — used by the runtime exec-map module.
*/
export function scriptExtension(scriptPath: string): string {
  return extensionNameLower(scriptPath);
}
