/**
Line renderer — the ONE system prefix and the line builder, ported from
`lib/ui.js`. Every nodeloop-owned line starts with the (brand-colored)
`[nodeloop]` prefix; child output NEVER passes through here.
*/
import {
  PALETTE,
  STYLE_ALIASES,
  paletteStyle,
  stripAnsi,
  wrapFactory,
  type ColorWrap
} from './colors.js';
import { getSymbols, type Symbols } from './icons.js';

/**
The brand prefix text (without brackets styling).
*/
export const BRAND = 'nodeloop';

export interface RenderOptions {
  /**
  0 = off, 1 = basic 16, 2 = 256, 3 = truecolor.
  */
  level: number;
  /**
  Unicode glyphs when true, ASCII fallback when false.
  */
  unicode: boolean;
}

export interface StyledUI {
  color: boolean;
  colorLevel: number;
  unicode: boolean;
  brand: string;
  sym: Symbols;
  stripAnsi: (s: string) => string;
  bold: ColorWrap;
  dim: ColorWrap;
  italic: ColorWrap;
  underline: ColorWrap;
  /**
  palette styles + legacy aliases
  */
  brand_: ColorWrap;
  amber: ColorWrap;
  purple: ColorWrap;
  blue: ColorWrap;
  green: ColorWrap;
  red: ColorWrap;
  gray: ColorWrap;
  slate: ColorWrap;
  cyan: ColorWrap;
  magenta: ColorWrap;
  yellow: ColorWrap;
}

/**
Build the styled toolkit: palette styles at the detected level, legacy
aliases, symbols, and the prefix/line builders.
*/
export function createStyles(options: RenderOptions): {
  ui: StyledUI;
  prefix: string;
  line: (icon: keyof Symbols | null, iconStyle: ColorWrap | null, message: string) => string;
} {
  const level = options.level;
  const isUseUnicode = options.unicode;
  const sym = getSymbols(isUseUnicode);
  const wrap = wrapFactory(level); // level-aware: colors off → plain strings

  const ui: StyledUI = {
    color: level > 0,
    colorLevel: level,
    unicode: isUseUnicode,
    brand: BRAND,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    italic: wrap(3, 23),
    underline: wrap(4, 24),
    sym,
    stripAnsi,
    brand_: paletteStyle(PALETTE.brand, level),
    amber: paletteStyle(PALETTE.amber, level),
    purple: paletteStyle(PALETTE.purple, level),
    blue: paletteStyle(PALETTE.blue, level),
    green: paletteStyle(PALETTE.green, level),
    red: paletteStyle(PALETTE.red, level),
    gray: paletteStyle(PALETTE.gray, level),
    slate: paletteStyle(PALETTE.slate, level),
    cyan: paletteStyle(PALETTE.brand, level), // legacy alias
    magenta: paletteStyle(PALETTE.purple, level), // legacy alias
    yellow: paletteStyle(PALETTE.amber, level) // legacy alias
  };
  void STYLE_ALIASES; // aliases are materialized explicitly above

  const P = ui.brand_(`[${BRAND}]`);
  /**
  `[nodeloop] <icon> <msg>` — icon colored, message pre-styled by caller.
  */
  const line = (
    icon: keyof Symbols | null,
    iconStyle: ColorWrap | null,
    message: string
  ): string => (icon && iconStyle ? `${P} ${iconStyle(sym[icon])} ${message}` : `${P} ${message}`);

  return { ui, prefix: P, line };
}

/**
HH:MM:SS — real local timestamps for verbose diagnostics.
*/
export function hhmmss(d: Date | undefined): string {
  const t = (d instanceof Date ? d : new Date()).toTimeString();
  return t.slice(0, 8);
}
