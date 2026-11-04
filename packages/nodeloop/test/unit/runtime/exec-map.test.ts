import { describe, expect, it } from 'vitest';
import {
  resolveExecMap,
  scriptExtForExecMap as scriptExtensionForExecMap
} from '../../../src/runtime/exec-map.js';

describe('resolveExecMap', () => {
  it('returns {cmd: undefined, used: false} when no map is configured', () => {
    expect(resolveExecMap(undefined, '/x/app.ts')).toEqual({ cmd: undefined, used: false });
  });

  it('returns not-used for exec-only runs (script is null)', () => {
    expect(resolveExecMap({ ts: 'tsx' }, undefined)).toEqual({ cmd: undefined, used: false });
  });

  it('returns not-used when the script extension has no mapping', () => {
    expect(resolveExecMap({ ts: 'tsx' }, '/x/app.js')).toEqual({ cmd: undefined, used: false });
  });

  it("maps 'app.ts' to the 'tsx' runner and marks it used", () => {
    expect(resolveExecMap({ ts: 'tsx' }, '/x/app.ts')).toEqual({ cmd: 'tsx', used: true });
  });

  it('looks up the LOWERCASED extension — key normalization happens upstream', () => {
    expect(scriptExtensionForExecMap('/x/App.TS')).toBe('ts');
    expect(resolveExecMap({ ts: 'tsx' }, '/x/App.TS')).toEqual({ cmd: 'tsx', used: true });
  });

  it('trims whitespace in the mapped command', () => {
    expect(resolveExecMap({ ts: '  tsx  ' }, '/x/app.ts')).toEqual({ cmd: 'tsx', used: true });
  });

  it('treats a blank mapped value as "no mapping"', () => {
    expect(resolveExecMap({ ts: ' '.repeat(3) }, '/x/app.ts')).toEqual({
      cmd: undefined,
      used: false
    });
  });

  it('returns not-used for an extensionless script path', () => {
    expect(resolveExecMap({ ts: 'tsx' }, '/x/Makefile')).toEqual({ cmd: undefined, used: false });
  });
});
