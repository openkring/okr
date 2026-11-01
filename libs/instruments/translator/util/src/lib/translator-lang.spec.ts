import { describe, expect, it } from 'vitest';
import { isLangCode, sortLanguages, swapLanguages } from './translator-lang';
import { AUTO_DETECT } from './translator.model';

describe('isLangCode', () => {
  it('accepts provider codes', () => {
    for (const c of ['de', 'haw', 'pt-PT', 'zh-CN', 'mni-Mtei']) expect(isLangCode(c)).toBe(true);
  });
  it('rejects anything else', () => {
    for (const c of ['', 'D', 'deutsch', 'de_CH', 'de-', '../x', 42, null, undefined]) expect(isLangCode(c)).toBe(false);
  });
});

describe('swapLanguages', () => {
  it('swaps a fixed pair', () => {
    expect(swapLanguages({ source: 'de', target: 'en' }, null)).toEqual({ source: 'en', target: 'de' });
  });
  it('uses the detected language for «Sprache erkennen»', () => {
    expect(swapLanguages({ source: AUTO_DETECT, target: 'en' }, 'fr')).toEqual({ source: 'en', target: 'fr' });
  });
  it('keeps the pair without a detection', () => {
    const s = { source: AUTO_DETECT, target: 'en' };
    expect(swapLanguages(s, null)).toBe(s);
  });
  it('keeps the pair when the detection equals the target', () => {
    const s = { source: AUTO_DETECT, target: 'en' };
    expect(swapLanguages(s, 'en')).toBe(s);
  });
});

describe('sortLanguages', () => {
  it('sorts by name and drops invalid and duplicate codes', () => {
    const sorted = sortLanguages([
      { code: 'fr', name: 'Französisch' },
      { code: 'en', name: 'Englisch' },
      { code: 'bad code', name: 'Aaa' },
      { code: 'en', name: 'Englisch (doppelt)' },
      { code: 'ar', name: 'Arabisch' },
    ], 'de');
    expect(sorted.map(l => l.code)).toEqual(['ar', 'en', 'fr']);
  });
});
