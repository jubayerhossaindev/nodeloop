/**
YAML loader — the documented SUBSET, ported 1:1 from `lib/config.js
parseYAML`: flat `key: value`, `- item` block lists, inline `[a, b]`
lists, quoted strings, numbers, booleans. No anchors/aliases, no
multi-line strings, no nested maps — a clear line-numbered error instead.
*/
import { parseQuoted, splitTop, stripComment } from './toml.js';

/**
Parse one YAML scalar / inline list value.
*/
export function parseYAMLValue(s: string, lineNo: number): unknown {
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) {
      throw new Error(`line ${lineNo}: unterminated inline list`);
    }
    const inner = s.slice(1, -1).trim();
    return inner
      ? splitTop(inner)
          .map((p) => parseYAMLValue(p.trim(), lineNo))
          .filter((v) => v !== '' && v !== undefined)
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
  if (/^[+-]?\d+(\.\d+)?$/u.test(s)) {
    return Number(s);
  }
  return s; // bare scalar (e.g. js,mjs,json) stays a raw string
}

/**
Parse a full YAML document (the supported subset).
*/
export function parseYAML(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let lastKey: string | undefined;
  const lines = text.split(/\r?\n/u);

  for (const [index, line_] of lines.entries()) {
    const rawLine = line_;
    const line = stripComment(rawLine, '#');
    if (!line.trim()) {
      continue;
    }

    const kv = line.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*(.*)$/u);
    if (kv && kv[1] === '') {
      // top-level key (no indent)
      const key = kv[2];
      const rawValue = kv[3];
      /* c8 ignore start — defensive: match groups always defined when regex matches */
      if (key === undefined || rawValue === undefined) {
        throw new Error(`invalid key at line ${index + 1}`);
      }
      /* c8 ignore end */
      const trimmedValue = rawValue.trim();
      if (trimmedValue === '') {
        out[key] = undefined; // block list may follow
      } else {
        out[key] = parseYAMLValue(trimmedValue, index + 1);
      }
      lastKey = key;
      continue;
    }

    const item = line.match(/^\s+-\s*(.+)$/u);
    if (item && lastKey) {
      const current = out[lastKey];
      if (!Array.isArray(current)) {
        out[lastKey] = current === undefined ? [] : [current];
      }
      const itemValue = item[1];
      /* c8 ignore start — defensive: match group always defined when regex matches */
      if (itemValue === undefined) {
        throw new Error(`invalid list item at line ${index + 1}`);
      }
      /* c8 ignore end */
      (out[lastKey] as unknown[]).push(parseYAMLValue(itemValue.trim(), index + 1));
      continue;
    }

    throw new Error(
      `unsupported YAML syntax at line ${index + 1}: "${rawLine.trim()}" — ` +
        'nodeloop supports flat "key: value" and "- item" lists only'
    );
  }

  for (const k of Object.keys(out)) {
    if (out[k] === undefined) {
      delete out[k];
    } // key with empty value and no list
  }
  return out;
}
