/**
nodeloop CLI — TypeScript implementation. Pure nodemon-style
auto-restart runner: no subcommands, no monitor. One job — run your
script and restart it when files change.

  nodeloop <script> [args...]
  nodeloop -h | --help | --version

Runner flags must come BEFORE the script; everything after the script
(past an optional `--`, nodemon-style) is passed to your app verbatim.
CLI flags override the config file. Long flags also accept "=" syntax.
Dispatch mirrors cli.js: help/version short-circuit; everything else is
a runner run.
*/
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHelp } from './cli/commands/help.js';
import { startRunner } from './cli/commands/start.js';
import { runVersion } from './cli/commands/version.js';
import { resolveColorFlag } from './cli/options/color.js';
import { createUI } from './terminal/ui.js';

/**
The version ALWAYS comes from this package's package.json — never hardcoded.
*/
function packageVersion(): string {
  const packageFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'package.json'
  );
  const package_ = JSON.parse(readFileSync(packageFile, 'utf8')) as { version: string };
  return package_.version;
}

const version = packageVersion();
const arguments_ = process.argv.slice(2);

/*
colors: --color / --no-color flags first — same raw-argv check as cli.js
*/
const ui = createUI({ color: resolveColorFlag(arguments_) });

if (arguments_.includes('-h') || arguments_.includes('--help')) {
  // eslint-disable-next-line n/no-process-exit
  process.exit(runHelp(ui, version));
}
if (arguments_.includes('--version')) {
  // eslint-disable-next-line n/no-process-exit
  process.exit(runVersion(ui, version));
}

try {
  startRunner(arguments_, {
    version,
    ui,
    createUI: (color) => createUI({ color })
  });
} catch (error) {
  /* fatal paths (bad script, missing config…) render + exit 1 — the exact
     legacy `fatal()` contract: red line on stderr, hint, exit code 1 */
  process.stderr.write(`${ui.fatal(error instanceof Error ? error.message : String(error))}\n`);
  const hint = (error as { hint?: string }).hint;
  if (hint) {
    process.stderr.write(`${ui.hint(hint)}\n`);
  }
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}
