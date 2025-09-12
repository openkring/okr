import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @jsverse/transloco
vi.mock('@jsverse/transloco', () => ({
  translate: vi.fn((key, arg) => `translated:${key}${arg ? ':' + JSON.stringify(arg) : ''}`),
  getBrowserLang: vi.fn(() => 'en'),
  HashMap: Object,
}));

import { getBrowserLang } from '@jsverse/transloco';
import { bkTranslate, convertCountryCode, getLabel, selectLanguage } from './i18n.util';

describe('bkTranslate', () => {
  it('returns empty string for null/undefined/empty key', () => {
    expect(bkTranslate(null)).toBe('');
    expect(bkTranslate(undefined)).toBe('');
    expect(bkTranslate('')).toBe('');
  });

  it('returns translated value for @-prefixed key with argument', () => {
    expect(bkTranslate('@test.key', { foo: 'bar' })).toBe('translated:test.key:{"foo":"bar"}');
  });

  it('returns translated value for @-prefixed key without argument', () => {
    expect(bkTranslate('@test.key')).toBe('translated:test.key');
  });

  it('returns key as-is for non-@-prefixed key', () => {
    expect(bkTranslate('plainKey')).toBe('plainKey');
  });
});

describe('selectLanguage', () => {
  beforeEach(() => {
    (getBrowserLang as any).mockReturnValue('en');
  });

  it('returns configuredLanguage if available', () => {
    expect(selectLanguage(['en', 'de'], 'en', 'de')).toBe('de');
  });

  it('returns browser language if configuredLanguage is not set', () => {
    expect(selectLanguage(['en', 'de'], 'en')).toBe('en');
  });

  it('returns defaultLanguage if selected language is not available', () => {
    expect(selectLanguage(['en', 'de'], 'en', 'fr')).toBe('en');
  });

  it('throws if browser language cannot be determined', () => {
    (getBrowserLang as any).mockReturnValue('');
    expect(() => selectLanguage(['en'], 'en')).toThrow(/browser language can not be determined/);
  });
});

describe('getLabel', () => {
  it('calls bkTranslate', () => {
    expect(getLabel('@label.key')).toBe('translated:label.key');
  });
});

describe('convertCountryCode', () => {
  it('calls bkTranslate with country code', () => {
    expect(convertCountryCode('ch')).toBe('translated:general.countries.CH');
  });
});