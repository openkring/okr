import { describe, it, expect, vi } from 'vitest';

vi.mock('../_gateway/gateway', () => ({ runGateway: vi.fn() }));
vi.mock('firebase-admin/app', () => ({ applicationDefault: vi.fn() }));
import { runGateway } from '../_gateway/gateway';
import { TRANSLATOR_OPS, validLanguagesParams, validTranslateManyParams, validTranslateParams } from './index';

const auth = { uid: 'u', token: {} };

describe('validTranslateParams', () => {
  it('trims the text and defaults to detection', () => {
    expect(validTranslateParams({ text: ' Hallo ', target: 'en' })).toEqual({ text: 'Hallo', source: '', target: 'en' });
  });
  it('rejects empty and too long text', () => {
    expect(() => validTranslateParams({ text: '   ', target: 'en' })).toThrow(/text/);
    expect(() => validTranslateParams({ text: 'x'.repeat(1001), target: 'en' })).toThrow(/text/);
  });
  it('rejects bad language codes', () => {
    expect(() => validTranslateParams({ text: 'a', source: 'x y', target: 'en' })).toThrow(/source/);
    expect(() => validTranslateParams({ text: 'a', target: undefined })).toThrow(/target/);
  });
});

describe('validTranslateManyParams', () => {
  it('trims the texts and checks the pair', () => {
    expect(validTranslateManyParams({ texts: [' Ausgang ', 'Kasse'], source: 'de', target: 'en' }))
      .toEqual({ texts: ['Ausgang', 'Kasse'], source: 'de', target: 'en' });
  });
  it('rejects empty, too many and too long batches', () => {
    expect(() => validTranslateManyParams({ texts: [], target: 'en' })).toThrow(/texts/);
    expect(() => validTranslateManyParams({ texts: ['a', ' '], target: 'en' })).toThrow(/texts/);
    expect(() => validTranslateManyParams({ texts: Array(21).fill('a'), target: 'en' })).toThrow(/texts/);
    expect(() => validTranslateManyParams({ texts: ['x'.repeat(1500), 'y'.repeat(600)], target: 'en' })).toThrow(/texts/);
  });
});

describe('validLanguagesParams', () => {
  it('needs a display language', () => {
    expect(validLanguagesParams({ display: 'fr' })).toEqual({ display: 'fr' });
    expect(() => validLanguagesParams({})).toThrow(/display/);
  });
});

describe('translator ops', () => {
  it('rejects anonymous callers', async () => {
    await expect(TRANSLATOR_OPS['translate']({ data: { text: 'a', target: 'en' } } as never)).rejects.toThrow(/authenticated/);
  });

  it('does not call the provider when source and target are the same', async () => {
    const res = await TRANSLATOR_OPS['translate']({ auth, data: { text: 'Hallo', source: 'de', target: 'de' } } as never);
    expect(res).toMatchObject({ translatedText: 'Hallo', detectedSource: null });
    expect(runGateway).not.toHaveBeenCalled();
  });

  it('passes the detection through only for «Sprache erkennen»', async () => {
    const gw = { data: { translatedText: 'Hello', detectedSource: 'de' }, attribution: { provider: 'Google', url: 'u' }, sourceTimestamp: null, cached: false };
    vi.mocked(runGateway).mockResolvedValue(gw as never);
    expect(await TRANSLATOR_OPS['translate']({ auth, data: { text: 'Hallo', target: 'en' } } as never))
      .toEqual({ translatedText: 'Hello', detectedSource: 'de', attribution: { provider: 'Google', url: 'u' } });
    expect(await TRANSLATOR_OPS['translate']({ auth, data: { text: 'Hallo', source: 'de', target: 'en' } } as never))
      .toMatchObject({ detectedSource: null });
  });
});
