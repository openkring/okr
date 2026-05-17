import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @jsverse/transloco
vi.mock('@jsverse/transloco', () => ({
  translate: vi.fn((key, arg) => `translated:${key}${arg ? ':' + JSON.stringify(arg) : ''}`),
  getBrowserLang: vi.fn(() => 'en'),
  HashMap: Object,
}));

import { getBrowserLang } from '@jsverse/transloco';
import { convertCountryCode, getLabel, selectLanguage } from './i18n.util';

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
  it('translates an @-prefixed key', () => {
    expect(getLabel('@label.key')).toBe('translated:label.key');
  });
});

describe('convertCountryCode', () => {
  it('translates a country code', () => {
    expect(convertCountryCode('ch')).toBe('translated:general.countries.CH');
  });
});