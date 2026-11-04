/**
The 2026 palette — ported 1:1 from `lib/ui.js`. `hex` drives truecolor;
the 256-color code is computed from hex at runtime (nearest256); `ansi`
is the curated basic-16 fallback (16-color themes vary wildly, so a
hand-picked mapping beats nearest-RGB math — lavender would otherwise
degrade to invisible white).
*/
export interface PaletteEntry {
  readonly hex: readonly [number, number, number];
  readonly ansi: number;
}

export const PALETTE = {
  brand: { hex: [0x42, 0xd9, 0xf3], ansi: 36 }, // cyan    — [nodeloop] prefix + info
  amber: { hex: [0xf3, 0xba, 0x65], ansi: 33 }, // amber   — restart event + `rs` word
  purple: { hex: [0xbd, 0xa0, 0xff], ansi: 35 }, // purple  — watch paths + extensions
  blue: { hex: [0x72, 0xab, 0xff], ansi: 34 }, // blue    — process starting
  green: { hex: [0x43, 0xd6, 0x9b], ansi: 32 }, // green   — success
  red: { hex: [0xff, 0x69, 0x7d], ansi: 31 }, // red     — failure
  gray: { hex: [0x91, 0xa0, 0xb5], ansi: 90 }, // gray    — secondary information
  slate: { hex: [0x89, 0x95, 0xa8], ansi: 90 } // slate   — shutdown
} satisfies Readonly<Record<string, PaletteEntry>>;

/**
Legacy style-name aliases (help screen + older call sites).
*/
export const STYLE_ALIASES: Readonly<Record<string, string>> = {
  cyan: 'brand',
  magenta: 'purple',
  yellow: 'amber',
  blue: 'blue',
  red: 'red',
  green: 'green',
  gray: 'gray'
};

/**
Nearest xterm-256 color for an RGB triple — the standard cube-vs-grayramp
algorithm used by tmux/chroma. Pure, deterministic, dependency-free.
*/
export function nearest256(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb;
  const CUBE = [0, 95, 135, 175, 215, 255] as const;
  const near = (v: number): number => {
    let index = 0;
    for (let index_ = 1; index_ < CUBE.length; index_++) {
      /* c8 ignore start — CUBE is fully populated; near() never returns undefined */
      if (Math.abs((CUBE[index_] ?? 0) - v) < Math.abs((CUBE[index] ?? 0) - v)) {
        index = index_;
      }
      /* c8 ignore end */
    }
    return index;
  };
  const code = 16 + 36 * near(r) + 6 * near(g) + near(b);
  // gray-ramp candidate (232..255 = 8 + 10*i): only worth it for grayish input
  const avg = (r + g + b) / 3;
  const spread = Math.max(Math.abs(r - avg), Math.abs(g - avg), Math.abs(b - avg));
  if (avg >= 8 && avg <= 238 && spread < 2.5) {
    const gray = 232 + Math.round((avg - 8) / 10);
    const cubeDistribution = Math.max(
      /* c8 ignore start — CUBE is fully populated; near() never returns undefined */
      Math.abs((CUBE[near(r)] ?? 0) - r),
      Math.abs((CUBE[near(g)] ?? 0) - g),
      Math.abs((CUBE[near(b)] ?? 0) - b)
      /* c8 ignore end */
    );
    if (Math.abs(8 + 10 * (gray - 232) - avg) <= cubeDistribution) {
      return gray;
    }
  }
  return code;
}

export type ColorWrap = (s: string) => string;

/**
Unconditional SGR wrapper — low-level building block. Prefer
`wrapFactory(level)` at UI construction time; a raw `wrap()` IGNORES the
color level and always emits codes (kept for tests/tools only).
*/
export function wrap(open: number | string, close: number | string): ColorWrap {
  return (s: string) => `\u{1B}[${open}m${s}\u{1B}[${close}m`;
}

/**
Level-aware SGR wrapper factory — the exact legacy `wrap` semantics:
`level ? escape-codes : plain string`. Use `wrapFactory(level)(open, close)`
so a UI built with colors off NEVER emits ANSI sequences.
*/
export function wrapFactory(
  level: number
): (open: number | string, close: number | string) => ColorWrap {
  return (open, close) => (s: string) => (level ? `\u{1B}[${open}m${s}\u{1B}[${close}m` : s);
}

/**
Strip every SGR sequence — used to align padding on PLAIN text.
*/
export function stripAnsi(s: string): string {
  const ansiEscape = String.fromCodePoint(0x1b);
  return s.replaceAll(new RegExp(String.raw`${ansiEscape}\[[0-9;]*m`, 'gu'), '');
}

/**
Build a style function for one palette entry at a given color level.
Level 0 (colors off) → the PLAIN string — never emits SGR codes.
*/
export function paletteStyle(entry: PaletteEntry, level: number): ColorWrap {
  if (level <= 0) {
    return String;
  }
  if (level >= 3) {
    return wrap(`38;2;${entry.hex[0]};${entry.hex[1]};${entry.hex[2]}`, 39);
  }
  if (level === 2) {
    return wrap(`38;5;${nearest256(entry.hex)}`, 39);
  }
  return wrap(entry.ansi, 39);
}
