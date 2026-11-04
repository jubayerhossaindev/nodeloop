/**
Command resolution — an exact TypeScript port of the exec-resolution half
of `lib/watch.js`: `tokenizeCommand`, `winQuote` and `resolveSpawn`.

Rules (identical to the legacy implementation):
  • no exec (or bare `node`) → the SAME node binary that is running
    nodeloop, spawned DIRECTLY (never whitespace-split — on Windows its
    absolute path can contain spaces: `C:\Program Files\nodejs\node.exe`).
  • absolute/relative paths (quoted or not) → direct spawn on every OS;
    unquoted spaced paths are re-merged CreateProcess-style while no file
    matches the shorter join.
  • Windows: bare names and .cmd/.bat files route through cmd.exe with
    MSVCRT argv re-quoting; `node`/`node.exe` always resolves to the
    running binary instead of a PATH lookup.
  • POSIX: bare names spawn directly (PATH + shebang handle it).

`platform` and `isExists` are injectable so the full Windows matrix is
unit-testable on any OS — the same seam the legacy code kept.
*/
import fs from 'node:fs';
import type { Platform } from '../utils/platform.js';

/**
Default "does this path point at an executable FILE" probe (dirs rejected).
*/
export function isExecutableFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
Split a command string into argv tokens, respecting ' and " quoting, so
absolute paths containing spaces survive intact:

  tokenizeCommand('npm run dev')                          → ['npm','run','dev']
  tokenizeCommand('"C:\\Program Files\\node\\node.exe"')  → ['C:\\Program Files\\node\\node.exe']

Inside double quotes `\"` is a literal quote and backslashes stay literal
(Windows paths). Unmatched quotes are tolerated. Tabs/newlines separate
tokens exactly like spaces.
*/
export function tokenizeCommand(string_: string | undefined | null): string[] {
  const s = string_ ?? '';
  const tokens: string[] = [];
  let current = '';
  let isHas = false;
  let quote: string | null = null;

  for (let index = 0; index < s.length; index++) {
    const ch = s.charAt(index);
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === '\\' && quote === '"' && s[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      isHas = true;
    } else if (' \t\n\r'.includes(ch)) {
      if (isHas) {
        tokens.push(current);
        current = '';
        isHas = false;
      }
    } else {
      current += ch;
      isHas = true;
    }
  }
  if (isHas) {
    tokens.push(current);
  }
  return tokens;
}

/**
Quote ONE token for a Windows command line (MSVCRT argv rules — what
node.exe itself parses). Used only in shell mode, where resolveSpawn's
tokens are re-assembled into a single command line for cmd.exe.
*/
export function winQuote(argument: string): string {
  if (argument === '') {
    return '""';
  }
  if (!/[\s"]/u.test(argument)) {
    return argument;
  }
  return `"${argument.replaceAll(/(\\*)"/gu, '$1$1\\"').replaceAll(/(\\*)$/gu, '$1$1')}"`;
}

export interface SpawnSpec {
  file: string;
  args: string[];
  shell: boolean;
}

export interface ResolveSpawnOptions {
  platform?: Platform;
  isExists?: (p: string) => boolean;
}

/**
Build the exact spawn() call for the configured exec. Pure — platform and
file-existence are injectable (see ResolveSpawnOptions).
*/
export function resolveSpawn(
  exec: string | undefined,
  nodeArguments: string[],
  script: string | null,
  scriptArguments: string[],
  options: ResolveSpawnOptions = {}
): SpawnSpec {
  const platform = options.platform ?? process.platform;
  const isExists = options.isExists ?? isExecutableFile;
  const tail = [
    ...(nodeArguments ?? []).map(String),
    ...(script ? [script] : []), // script is optional for exec-only runs (npm run dev)
    ...(scriptArguments ?? []).map(String)
  ];
  const viaExecPath = (): SpawnSpec => ({ file: process.execPath, args: tail, shell: false });

  const raw = typeof exec === 'string' ? exec.trim() : '';
  if (!raw || /^node(\.exe)?$/iu.test(raw)) {
    return viaExecPath();
  }

  const tokens = tokenizeCommand(raw);
  /* c8 ignore start — defensive: non-empty raw string always yields ≥ 1 token */
  if (tokens.length === 0) {
    return viaExecPath();
  }
  const first = tokens[0];
  if (first === undefined) {
    return viaExecPath();
  }
  /* c8 ignore end */
  const rest = tokens.slice(1);

  let command = first;
  let commandArguments = rest;

  // CreateProcess-style merge for unquoted paths containing spaces:
  // `C:\Program Files\nodejs\node.exe` arrives as ['C:\Program',
  // 'Files\nodejs\node.exe']. Only a path-y first token participates,
  // and only while no existing FILE matches the shorter joins.
  if (/[\\/]/u.test(first) && !isExists(first)) {
    for (let take = 2; take <= tokens.length; take++) {
      const joined = tokens.slice(0, take).join(' ');
      if (isExists(joined)) {
        command = joined;
        commandArguments = tokens.slice(take);
        break;
      }
    }
  }

  if (platform !== 'win32') {
    return { file: command, args: [...commandArguments, ...tail], shell: false };
  }

  // Windows specifics
  if (/^node(\.exe)?$/iu.test(command)) {
    return { file: process.execPath, args: [...commandArguments, ...tail], shell: false };
  }
  const isNeedsShell = !/[\\/]/u.test(command) || /\.(cmd|bat)$/iu.test(command);
  if (isNeedsShell) {
    const cmdline = [command, ...commandArguments, ...tail]
      .map((element) => winQuote(element))
      .join(' ');
    return { file: cmdline, args: [], shell: true };
  }
  return { file: command, args: [...commandArguments, ...tail], shell: false };
}
