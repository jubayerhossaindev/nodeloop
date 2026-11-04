import { describe, it, expect } from 'vitest';
import { extOption as extensionOption } from '../../../src/cli/options/ext.js';
import { parseInvocation } from '../../../src/cli/options/parser.js';

describe('extOption.merge', () => {
  it('CLI value wins over config.ext', () => {
    expect(extensionOption.merge('ts', { ext: 'js' })).toBe('ts');
  });

  it("empty CLI value ('') falls through to config", () => {
    expect(extensionOption.merge('', { ext: 'js,json' })).toBe('js,json');
  });

  it('undefined falls through to config', () => {
    expect(extensionOption.merge(undefined, { ext: 'js,json' })).toBe('js,json');
  });

  it('neither CLI nor config yields undefined (the default)', () => {
    expect(extensionOption.merge(undefined, {})).toBeUndefined();
    expect(extensionOption.merge('', {})).toBeUndefined();
  });
});

describe('ext parser integration', () => {
  it("'-e js,json' sets values.ext to 'js,json'", () => {
    const parsed = parseInvocation(['-e', 'js,json']);
    expect(parsed.values.ext).toBe('js,json');
    expect(parsed.scriptToken).toBeNull();
  });

  it("'--ext js,json' (separate tokens) sets values.ext to 'js,json'", () => {
    expect(parseInvocation(['--ext', 'js,json']).values.ext).toBe('js,json');
  });

  it("'--ext=js,json' (= syntax) sets values.ext to 'js,json'", () => {
    expect(parseInvocation(['--ext=js,json']).values.ext).toBe('js,json');
  });

  it('short and long flags behave identically', () => {
    const viaShort = parseInvocation(['-e', 'js,json']).values;
    const viaLong = parseInvocation(['--ext', 'js,json']).values;
    const viaEq = parseInvocation(['--ext=js,json']).values;
    expect(viaShort).toEqual(viaLong);
    expect(viaShort).toEqual(viaEq);
  });
});
