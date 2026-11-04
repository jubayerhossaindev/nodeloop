/**
Lifecycle icons — exactly six, ported from `lib/ui.js`. Semantic, never
decorative: every icon is paired with a readable message, icons are never
the only carrier of information, and an ASCII fallback exists for
terminals without Unicode (piped output, TERM=dumb, NODELOOP_ASCII=1).
*/
export const SYM_UNICODE = {
  watch: '●',
  play: '▶',
  restart: '↻',
  ok: '✓',
  fail: '✕',
  stop: '■',
  warn: '⚠',
  tip: '→',
  mid: '·',
  dash: '—'
} as const;

export const SYM_ASCII = {
  watch: 'o',
  play: '>',
  restart: '>',
  ok: '+',
  fail: 'x',
  stop: '-',
  warn: '!',
  tip: '->',
  mid: '-',
  dash: '-'
} as const;

export type Symbols = typeof SYM_UNICODE;

/**
Pick the symbol set for a capability level.
*/
export function getSymbols(isUnicode: boolean): Symbols {
  return (isUnicode ? SYM_UNICODE : SYM_ASCII) as Symbols;
}
