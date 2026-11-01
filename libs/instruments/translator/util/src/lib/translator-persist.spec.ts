import { describe, expect, it } from 'vitest';
import { restoreTranslator, serializeTranslator } from './translator-persist';
import { AUTO_DETECT, DEFAULT_TRANSLATOR_SETTINGS } from './translator.model';

describe('translator persistence', () => {
  it('round-trips a pair', () => {
    const s = { source: 'de', target: 'pt-PT' };
    expect(restoreTranslator(serializeTranslator(s))).toEqual(s);
  });
  it('keeps «Sprache erkennen»', () => {
    expect(restoreTranslator(serializeTranslator({ source: AUTO_DETECT, target: 'fr' }))).toEqual({ source: AUTO_DETECT, target: 'fr' });
  });
  it('falls back per field', () => {
    expect(restoreTranslator(null)).toEqual(DEFAULT_TRANSLATOR_SETTINGS);
    expect(restoreTranslator('not json')).toEqual(DEFAULT_TRANSLATOR_SETTINGS);
    expect(restoreTranslator('{"source":"de","target":7}')).toEqual({ source: 'de', target: DEFAULT_TRANSLATOR_SETTINGS.target });
    expect(restoreTranslator('{"source":"x y","target":"it"}')).toEqual({ source: DEFAULT_TRANSLATOR_SETTINGS.source, target: 'it' });
  });
});
