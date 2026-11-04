/**
The existsSync/statSync race guard — a script that vanishes between the
two calls is treated as a FILE, not a crash. Forced with a scoped fs mock.
*/
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: actual.existsSync,
      statSync: (p: fs.PathLike) => {
        if (String(p).endsWith('racy-script.js')) {
          throw new Error('vanished');
        }
        return actual.statSync(p);
      }
    }
  };
});

const { validateScript } = await import('../../../src/cli/options/validator.js');

describe('validateScript — statSync race guard', () => {
  it('a path that vanishes between existsSync and statSync is treated as a file', () => {
    // the file REALLY exists (existsSync is the real one) but statSync throws
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-racy-'));
    const real = path.join(direction, 'racy-script.js');
    fs.writeFileSync(real, 'x');
    expect(() => validateScript('racy-script.js', real, direction)).not.toThrow();
    expect(validateScript('racy-script.js', real, direction)).toEqual({
      scriptPath: real,
      isDirectory: false
    });
    fs.rmSync(direction, { recursive: true, force: true });
  });
});
