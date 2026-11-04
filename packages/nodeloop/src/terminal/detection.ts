/**
Terminal capability detection — port of `lib/ui.js` detection half.

Color levels (0-3, chalk/supports-color semantics):
  • FORCE_COLOR=1/2/3     → that level, even piped; FORCE_COLOR=0/false → off
  • NO_COLOR (non-empty)  → off (https://no-color.org)
  • otherwise             → stream.isTTY && TERM !== 'dumb' required;
    truecolor (24-bit) when COLORTERM/WT_SESSION/… say so, 256-color when
    TERM mentions 256color (or Windows, where libuv enables VT processing),
    basic 16 otherwise.

Glyphs: NODELOOP_ASCII=1 → ASCII everywhere; otherwise unicode on a TTY,
ASCII when piped / TERM=dumb. ENV IS INJECTABLE for deterministic tests.
*/

export interface DetectableStream {
  isTTY?: boolean;
}

/**
Environment injection keeps the detection pure and test-friendly.
*/
export interface DetectEnvironment {
  FORCE_COLOR?: string;
  NO_COLOR?: string;
  TERM?: string;
  COLORTERM?: string;
  WT_SESSION?: string;
  WT_PROFILE_ID?: string;
  TERM_PROGRAM?: string;
  NODELOOP_ASCII?: string;
  CI?: string;
}

/**
Color level for a stream: 0 = off, 1 = basic 16, 2 = 256, 3 = truecolor.
FORCE_COLOR wins over NO_COLOR — same precedence as chalk/supports-color.
*/
export function detectColorLevel(
  stream?: DetectableStream,
  environment: DetectEnvironment = process.env,
  platform: string = process.platform
): number {
  if (environment.FORCE_COLOR !== undefined && environment.FORCE_COLOR !== '') {
    if (environment.FORCE_COLOR === '0' || environment.FORCE_COLOR === 'false') {
      return 0;
    }
    if (environment.FORCE_COLOR === '1' || environment.FORCE_COLOR === 'true') {
      return 1;
    }
    if (environment.FORCE_COLOR === '2') {
      return 2;
    }
    return 3;
  }
  if (environment.NO_COLOR !== undefined && environment.NO_COLOR !== '') {
    return 0;
  } // https://no-color.org
  if (!stream || !stream.isTTY || environment.TERM === 'dumb') {
    return 0;
  }
  const colorterm = (environment.COLORTERM || '').toLowerCase();
  if (
    colorterm.includes('truecolor') ||
    colorterm.includes('24bit') ||
    environment.WT_SESSION ||
    environment.WT_PROFILE_ID
  ) {
    return 3;
  }
  /* Windows Terminal / VS Code / WezTerm / ghostty carry truecolor; VS Code
     and Windows consoles at minimum do 256 (libuv enables VT on Win 10+) */
  const tp = environment.TERM_PROGRAM;
  if (tp === 'WezTerm' || tp === 'ghostty' || tp === 'vscode' || tp === 'iTerm.app') {
    return colorterm ? 3 : 2;
  }
  if (platform === 'win32' || (environment.TERM || '').includes('256color')) {
    return 2;
  }
  if (environment.CI) {
    return 1;
  }
  return 1;
}

/**
Boolean convenience wrapper (back-compat): level > 0.
*/
export function isDetectColor(
  stream?: DetectableStream,
  environment: DetectEnvironment = process.env,
  platform: string = process.platform
): boolean {
  return detectColorLevel(stream, environment, platform) > 0;
}

/**
Short alias for `isDetectColor`.
*/
export const detectColor = isDetectColor;

/**
True if the given stream can render unicode lifecycle icons.
*/
export function isDetectUnicode(
  stream?: DetectableStream,
  environment: DetectEnvironment = process.env
): boolean {
  if (environment.NODELOOP_ASCII !== undefined && environment.NODELOOP_ASCII !== '0') {
    return false;
  }
  if (!stream || !stream.isTTY || environment.TERM === 'dumb') {
    return false;
  }
  return true;
}

/**
Short alias for `isDetectUnicode`.
*/
export const detectUnicode = isDetectUnicode;
