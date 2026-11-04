import path from 'node:path';

/**
`positive()` — the legacy numeric-option normalizer: `Number(value)`
finite and > 0, else the fallback. A string "300" is accepted (CLI flags
arrive as strings), garbage and non-positive values fall back.
*/
export function positive(value: string | number | undefined | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
`normalizePollInterval` — legacyWatch: true → 1000ms; a number ≥ 50 →
that many ms; anything else → 0 (fs.watch events).
*/
export function normalizePollInterval(value: boolean | number | undefined): number {
  if (value === true) {
    return 1000;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 50) {
    return value;
  }
  return 0;
}

/**
`normalizeExtensions` — ".js" → "js" (leading dot stripped, lowercased);
accepts a comma string or an array; blanks dropped.
*/
export function normalizeExtensions(value: string | readonly string[] | undefined): string[] {
  const array = Array.isArray(value) ? value : String(value ?? '').split(',');
  return array.map((s) => String(s).trim().toLowerCase().replace(/^\./u, '')).filter(Boolean);
}

/**
Short alias for `normalizeExtensions`.
*/
export const normalizeExts = normalizeExtensions;

/**
`normalizeIgnores` — ".git" must STAY ".git" (a leading dot is part of
the name); matching is case-insensitive, display keeps the original
spelling (".DS_Store" stays ".DS_Store").
*/
export function normalizeIgnores(value: readonly string[]): {
  set: Set<string>;
  display: string[];
} {
  const set = new Set<string>();
  const display: string[] = [];
  for (const item of value) {
    const s = item.trim();
    if (!s) {
      continue;
    }
    const key = s.toLowerCase();
    if (set.has(key)) {
      continue;
    }

    set.add(key);
    display.push(s);
  }
  return { set, display };
}

/**
`normalizeWatchPaths` — watch-scope prefixes relative to cwd.
Absolute paths are made relative; `./` and trailing `/` trimmed;
backslashes normalized; duplicates dropped; comparison stays
case-sensitive (watch scopes are developer input).
*/
export function normalizeWatchPaths(
  value: string | readonly string[] | undefined,
  cwd: string
): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  const array = Array.isArray(value) ? value : String(value).split(',');
  const out: string[] = [];
  for (const item of array) {
    let s = String(item).trim();
    if (!s) {
      continue;
    }
    if (path.isAbsolute(s)) {
      s = path.relative(cwd, s);
    }
    s = s.replaceAll('\\', '/');
    while (s.startsWith('./')) {
      s = s.slice(2);
    }
    while (s.endsWith('/')) {
      s = s.slice(0, -1);
    }
    if (s && !out.includes(s)) {
      out.push(s);
    }
  }
  return out;
}
