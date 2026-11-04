/**
`runHelp` / `renderHelp` — both the injectable writer and the default
console.log path must be covered (the default is what the CLI binary uses).
*/
import { describe, it, expect, vi } from 'vitest';
import { renderHelp, runHelp } from '../../../src/cli/commands/help.js';
import { createUI } from '../../../src/terminal/ui.js';

const ui = createUI({ color: false });

describe('help command', () => {
  it('renderHelp returns the ui.help text', () => {
    const text = renderHelp(ui, '1.0.0');
    expect(text).toContain('USAGE');
    expect(text).toContain('--version');
  });

  it('runHelp writes through the injected writer and returns exit code 0', () => {
    const chunks: string[] = [];
    const code = runHelp(ui, '9.9.9', (s) => {
      chunks.push(s);
    });
    expect(code).toBe(0);
    expect(chunks.join('')).toContain('9.9.9');
  });

  it('runHelp defaults to console.log', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    try {
      const code = runHelp(ui, '1.0.0');
      expect(code).toBe(0);
      expect(String(write.mock.calls[0]?.[0])).toContain('USAGE');
    } finally {
      write.mockRestore();
    }
  });
});
