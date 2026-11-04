/**
`runVersion` — banner through the injected writer and the default
console.log path.
*/
import { describe, it, expect, vi } from 'vitest';
import { runVersion } from '../../../src/cli/commands/version.js';
import { createUI } from '../../../src/terminal/ui.js';

const ui = createUI({ color: false });

describe('version command', () => {
  it('writes the banner through the injected writer, exit code 0', () => {
    const chunks: string[] = [];
    const code = runVersion(ui, '4.2.0', (s) => {
      chunks.push(s);
    });
    expect(code).toBe(0);
    expect(chunks.join('')).toContain('[nodeloop]');
    expect(chunks.join('')).toContain('4.2.0');
  });

  it('defaults to console.log', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    try {
      const code = runVersion(ui, '1.0.0');
      expect(code).toBe(0);
      expect(String(write.mock.calls[0]?.[0])).toContain('[nodeloop]');
    } finally {
      write.mockRestore();
    }
  });
});
