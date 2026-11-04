/**
TOML loader — an honest, documented SUBSET, ported 1:1 from
`lib/config.js parseTOML`: flat `key = value`, single-line arrays,
`[sections]` (nested — the sanitizer only reads top-level keys and will
warn), quoted strings with escapes, booleans, numbers with `_` separators.
Unsupported syntax throws a clear error naming the line instead of
silently misreading the config.
*/

/**
Cut a `#` comment that is not inside quotes (must be line-start or after whitespace).
*/
export function stripComment(line: string, marker: string): string {
  let isInSingle = false;
  let isInDouble = false;
  for (let index = 0; index < line.length; index++) {
    const ch = line.charAt(index);
    if (isInDouble) {
      if (ch === '"') {
        isInDouble = false;
      }
      continue;
    }
    if (isInSingle) {
      if (ch === "'") {
        isInSingle = false;
      }
      continue;
    }
    if (ch === '"') {
      isInDouble = true;
      continue;
    }
    if (ch === "'") {
      isInSingle = true;
      continue;
    }
    if (ch === marker && (index === 0 || /\s/u.test(line.charAt(index - 1)))) {
      return line.slice(0, index);
    }
  }
  return line;
}

/**
Split on `sep` outside quotes and brackets.
*/
export function splitTop(s: string, separator = ','): string[] {
  const parts: string[] = [];
  let current = '';
  let isInSingle = false;
  let isInDouble = false;
  let depth = 0;
  for (const ch of s) {
    if (isInDouble) {
      current += ch;
      if (ch === '"') {
        isInDouble = false;
      }
      continue;
    }
    if (isInSingle) {
      current += ch;
      if (ch === "'") {
        isInSingle = false;
      }
      continue;
    }
    if (ch === '"') {
      isInDouble = true;
      current += ch;
      continue;
    }
    if (ch === "'") {
      isInSingle = true;
      current += ch;
      continue;
    }
    if (ch === '[' || ch === '{') {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ']' || ch === '}') {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/**
Parse a quoted string ("…" with escapes, '…' literal).
*/
export function parseQuoted(s: string): string {
  const q = s.charAt(0);
  /* c8 ignore start — defensive: parseQuoted is only called on quote-prefixed input */
  if (q !== '"' && q !== "'") {
    throw new Error(`expected a quoted string: ${s}`);
  }
  /* c8 ignore end */
  const end = s.lastIndexOf(q);
  if (end <= 0 || end !== s.length - 1) {
    throw new Error(`unterminated string: ${s}`);
  }
  const body = s.slice(1, end);
  if (q === "'") {
    return body;
  } // literal string: no escapes
  let out = '';
  for (let index = 0; index < body.length; index++) {
    const ch = body.charAt(index);
    if (ch === '\\') {
      const next = body[index + 1];
      if (next === undefined) {
        throw new Error('dangling escape in string');
      }
      out += { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' }[next] ?? next;
      index += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
Parse one TOML scalar / single-line array value.
*/
export function parseTOMLValue(s: string): unknown {
  if (s === '') {
    throw new Error('empty value');
  }
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) {
      throw new Error('arrays must be on ONE line: [ "a", "b" ]');
    }
    const inner = s.slice(1, -1).trim();
    return inner
      ? splitTop(inner)
          .map((p) => parseTOMLValue(p.trim()))
          .filter((v) => v !== undefined && v !== '')
      : [];
  }
  if (s.startsWith('"') || s.startsWith("'")) {
    return parseQuoted(s);
  }
  if (s === 'true') {
    return true;
  }
  if (s === 'false') {
    return false;
  }
  const number_ = Number(s.replaceAll('_', ''));
  return s !== '' && Number.isFinite(number_) && /^[+-]?[\d_.]+$/u.test(s) ? number_ : s;
}

/**
`[a.b]` section keys may be quoted.
*/
export function unquoteTOMLKey(k: string): string {
  return k.startsWith('"') || k.startsWith("'") ? parseQuoted(k) : k;
}

/**
Parse a full TOML document (the supported subset).
*/
export function parseTOML(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let section: Record<string, unknown> = out;
  const lines = text.split(/\r?\n/u);

  for (const [index, line_] of lines.entries()) {
    const rawLine = line_;
    const line = stripComment(rawLine, '#').trim();
    if (!line) {
      continue;
    }

    const sec = line.match(/^\[([^[\]]+)\]$/u);
    if (sec) {
      const sectionName = sec[1];
      /* c8 ignore start — defensive: sectionName from regex match group is always defined */
      if (sectionName === undefined) {
        throw new Error(`invalid section at line ${index + 1}`);
      }
      /* c8 ignore end */
      const parts = sectionName.split('.').map((p) => unquoteTOMLKey(p.trim()));
      section = out;
      for (const p of parts) {
        if (typeof section[p] !== 'object' || section[p] === null) {
          section[p] = {};
        }
        section = section[p] as Record<string, unknown>;
      }
      continue;
    }

    const m = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/u);
    if (!m) {
      throw new Error(
        `unsupported TOML syntax at line ${index + 1}: "${rawLine.trim()}" — expected "key = value"`
      );
    }
    try {
      const key = m[1];
      const value = m[2];
      /* c8 ignore start — defensive: key/value from regex match groups are always defined */
      if (key === undefined || value === undefined) {
        throw new Error('invalid key/value pair');
      }
      /* c8 ignore end */
      section[key] = parseTOMLValue(value.trim());
    } catch (error) {
      /* istanbul ignore next — err is always an Error from parseTOMLValue */
      throw new Error(
        `line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
  return out;
}
