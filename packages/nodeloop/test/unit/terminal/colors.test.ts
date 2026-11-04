import { describe, expect, it } from 'vitest';
import {
  PALETTE,
  STYLE_ALIASES,
  nearest256,
  paletteStyle,
  stripAnsi,
  wrap,
  wrapFactory
} from '../../../src/terminal/colors.js';

describe('nearest256', () => {
  it('maps the brand color [0x42,0xD9,0xF3] to cube cell 81', () => {
    // near(66)=1(95), near(217)=4(215), near(243)=5(255) → 16+36+24+5 = 81; too colorful for the ramp
    expect(nearest256([0x42, 0xd9, 0xf3])).toBe(81);
  });

  it('maps pure gray [128,128,128] onto the gray ramp (244, not the cube)', () => {
    // avg=128, spread=0 → gray = 232 + round(120/10) = 244; |128-128| = 0 ≤ cubeDist 7
    expect(nearest256([128, 128, 128])).toBe(244);
  });

  it('maps black [0,0,0] to the cube start (16)', () => {
    expect(nearest256([0, 0, 0])).toBe(16);
  });

  it('maps white [255,255,255] to the cube end (231)', () => {
    // avg 255 > 238 → gray ramp not considered
    expect(nearest256([255, 255, 255])).toBe(231);
  });

  it('maps near-black gray [9,9,9] onto the first gray-ramp cell (232)', () => {
    // avg=9 → gray = 232 + round(0.1) = 232; |8-9| = 1 ≤ cubeDist 9
    expect(nearest256([9, 9, 9])).toBe(232);
  });

  it('falls back to the cube when the gray ramp is farther than the cube', () => {
    // [215,217,213]: avg=215, spread=2 → gray considered; cubeDist=2 but gray-dist=3 → cube wins
    expect(nearest256([215, 217, 213])).toBe(188);
  });
});

describe('wrap', () => {
  it('wraps text with the given SGR open/close codes', () => {
    expect(wrap(1, 22)('x')).toBe('\u{1B}[1mx\u{1B}[22m');
  });

  it('accepts string open/close sequences', () => {
    expect(wrap('38;2;66;217;243', 39)('hi')).toBe('\u{1B}[38;2;66;217;243mhi\u{1B}[39m');
  });
});

describe('stripAnsi', () => {
  it('removes every SGR sequence, keeping the text', () => {
    expect(
      stripAnsi(
        '\u{1B}[36m[nodeloop]\u{1B}[39m \u{1B}[38;5;81mx\u{1B}[39m \u{1B}[90mplain\u{1B}[39m'
      )
    ).toBe('[nodeloop] x plain');
  });
});

describe('PALETTE', () => {
  it('has exactly the 8 documented entries', () => {
    expect(Object.keys(PALETTE).toSorted((a, b) => a.localeCompare(b))).toEqual(
      ['amber', 'blue', 'brand', 'gray', 'green', 'purple', 'red', 'slate'].toSorted((a, b) =>
        a.localeCompare(b)
      )
    );
  });

  it('carries the documented hex values and ANSI fallbacks', () => {
    expect(PALETTE.brand).toEqual({ hex: [0x42, 0xd9, 0xf3], ansi: 36 });
    expect(PALETTE.amber).toEqual({ hex: [0xf3, 0xba, 0x65], ansi: 33 });
    expect(PALETTE.purple).toEqual({ hex: [0xbd, 0xa0, 0xff], ansi: 35 });
    expect(PALETTE.blue).toEqual({ hex: [0x72, 0xab, 0xff], ansi: 34 });
    expect(PALETTE.green).toEqual({ hex: [0x43, 0xd6, 0x9b], ansi: 32 });
    expect(PALETTE.red).toEqual({ hex: [0xff, 0x69, 0x7d], ansi: 31 });
    expect(PALETTE.gray).toEqual({ hex: [0x91, 0xa0, 0xb5], ansi: 90 });
    expect(PALETTE.slate).toEqual({ hex: [0x89, 0x95, 0xa8], ansi: 90 });
  });
});

describe('paletteStyle', () => {
  it('level 3 → 24-bit RGB SGR', () => {
    expect(paletteStyle(PALETTE.brand!, 3)('x')).toBe('\u{1B}[38;2;66;217;243mx\u{1B}[39m');
  });

  it('level 2 → 256-color SGR using nearest256', () => {
    expect(paletteStyle(PALETTE.brand!, 2)('x')).toBe('\u{1B}[38;5;81mx\u{1B}[39m');
  });

  it('level 1 → the curated ANSI code', () => {
    expect(paletteStyle(PALETTE.brand!, 1)('x')).toBe('\u{1B}[36mx\u{1B}[39m');
  });

  it('level 0 → plain string, NO SGR codes (legacy wrap semantics: colors off stays readable)', () => {
    expect(paletteStyle(PALETTE.brand!, 0)('x')).toBe('x');
    expect(paletteStyle(PALETTE.red!, 0)('y')).toBe('y');
  });

  it('wrapFactory(0) makes every style a no-op (regression: --no-color must never emit SGR)', () => {
    const wrap = wrapFactory(0);
    expect(wrap(1, 22)('bold')).toBe('bold');
    expect(wrap('38;2;1;2;3', 39)('rgb')).toBe('rgb');
  });

  it('wrapFactory(1) emits the codes', () => {
    const wrap = wrapFactory(1);
    expect(wrap(1, 22)('bold')).toBe('\u{1B}[1mbold\u{1B}[22m');
  });
});

describe('STYLE_ALIASES', () => {
  it('keeps the legacy name mapping intact', () => {
    expect(STYLE_ALIASES).toEqual({
      cyan: 'brand',
      magenta: 'purple',
      yellow: 'amber',
      blue: 'blue',
      red: 'red',
      green: 'green',
      gray: 'gray'
    });
  });
});
