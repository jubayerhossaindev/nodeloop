/**
Path helpers — every function, every branch, against the real filesystem.
*/
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveFromCwd,
  displayPath,
  extNameLower as extensionNameLower,
  fileExists,
  isDirectory
} from '../../../src/utils/paths.js';

describe('path helpers', () => {
  it('resolveFromCwd resolves relative paths and passes absolute ones through', () => {
    expect(resolveFromCwd('/a/b', 'app.js')).toBe(path.resolve('/a/b', 'app.js'));
    const abs = path.resolve('/a/b', 'app.js');
    expect(resolveFromCwd('/other', abs)).toBe(abs);
  });

  it('displayPath returns the relative path and the absolute fallback', () => {
    expect(displayPath('/a', '/a/b/c.js')).toBe(path.join('b', 'c.js'));
    // equal → path.relative yields '' → the target itself comes back
    expect(displayPath('/a/b', '/a/b')).toBe('/a/b');
  });

  it('extNameLower lowercases and strips the dot', () => {
    expect(extensionNameLower('app.TS')).toBe('ts');
    expect(extensionNameLower('archive.tar.GZ')).toBe('gz');
    expect(extensionNameLower('noext')).toBe('');
  });

  it('fileExists mirrors existsSync', () => {
    expect(fileExists(fileURLToPath(import.meta.url))).toBe(true);
    expect(fileExists('/definitely/not/here')).toBe(false);
  });

  it('isDirectory distinguishes dirs, files and missing paths', () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-paths-'));
    try {
      const file = path.join(direction, 'f.txt');
      fs.writeFileSync(file, 'x');
      expect(isDirectory(direction)).toBe(true);
      expect(isDirectory(file)).toBe(false);
      expect(isDirectory(path.join(direction, 'gone'))).toBe(false);
    } finally {
      fs.rmSync(direction, { recursive: true, force: true });
    }
  });
});
