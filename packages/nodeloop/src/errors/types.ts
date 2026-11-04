/**
Typed error taxonomy for the TypeScript implementation.

The legacy CLI communicates failures by printing + `process.exit(1)`.
The TypeScript layer keeps the exact same user-visible text but models
the failures as typed errors so the command layer owns the printing,
tests can assert on classes, and the renderer owns the styling.
*/
export class NodeloopError extends Error {
  /**
  Rendered guidance line (styled by the caller, message kept plain).
  */
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = this.constructor.name;
    this.hint = hint;
  }
}

/**
`config file not found: <file>` — explicit --config pointing at nothing.
*/
export class ConfigFileNotFoundError extends NodeloopError {
  constructor(file: string) {
    super(
      `config file not found: ${file}`,
      'supported: nodeloop.json · .nodelooprc · nodeloop.toml · nodeloop.yml · nodeloop.js · nodeloop.ts'
    );
  }
}

/**
Invalid configuration file — mirrors `lib/config.js` error results.
*/
export class InvalidConfigError extends NodeloopError {}

/**
`no script given and none found` — resolution chain exhausted, no exec.
*/
export class NoScriptError extends NodeloopError {
  constructor(hint: string) {
    super('no script given and none found', hint);
  }
}

/**
`script not found: <script>` — includes the special `lag` wording.
*/
export class ScriptNotFoundError extends NodeloopError {
  constructor(script: string, hint?: string) {
    super(`script not found: ${script}`, hint);
  }
}

/**
Directory script without an entry file inside (needs index.js / package.json).
*/
export class ScriptIsDirectoryError extends NodeloopError {
  constructor(script: string) {
    super(
      `script is a directory: ${script} — node found no entry file inside it (needs index.js or package.json)`,
      'to run a dev server: nodeloop --exec "npm run dev" · or set "exec" in a config file · or pass an entry FILE: nodeloop app.js'
    );
  }
}
