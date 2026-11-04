/**
JSON config loader — `nodeloop.json` / `.nodelooprc` / `package.json`.
Handles the Windows BOM (U+FEFF) that Notepad and PowerShell 5.1
`Set-Content -Encoding UTF8` prepend — JSON.parse chokes on it.
*/

/**
Strip a leading UTF-8 BOM (U+FEFF) if present.
*/
export function stripBOM(s: string): string {
  return s.codePointAt(0) === 0xfe_ff ? s.slice(1) : s;
}

/**
Parse JSON text with BOM tolerance. Throws the raw SyntaxError on bad JSON.
*/
export function parseJsonWithBom(text: string): Record<string, unknown> {
  return JSON.parse(stripBOM(text)) as Record<string, unknown>;
}
