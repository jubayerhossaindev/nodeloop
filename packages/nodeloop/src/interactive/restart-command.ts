/**
The manual-restart line matcher — port of `lib/stdin.js restartMatcher`.
Same semantics as the built-in default: trimmed, case-insensitive, exact
word — "rs" does not fire for "rslash". Accepts one word or a list.
*/
export function restartMatcher(word: string | readonly string[]): (line: string) => boolean {
  const list = Array.isArray(word) ? word : [word];
  const esc = list.map((w) => String(w).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|');
  const re = new RegExp(String.raw`^\s*(?:${esc})\s*(?:\r?\n)?$`, 'iu');
  return (line: string) => re.test(line);
}

/**
The built-in words when config `restartable` is unset.
*/
export const DEFAULT_RESTART_WORDS: readonly string[] = ['rs', 'restart'];
