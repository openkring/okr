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

  it('falls back to default when the browser language is not in the enabled subset', () => {
    // browser lang mocked to 'fr', which is outside the ['de', 'en'] subset
    (getBrowserLang as any).mockReturnValue('fr');
    expect(selectLanguage(['de', 'en'], 'de', undefined)).toBe('de');
  });

  it('keeps a configured language that is in the enabled subset', () => {
    expect(selectLanguage(['de', 'fr'], 'de', 'fr')).toBe('fr');
  });

  it('drops a configured language that is not in the enabled subset', () => {
    expect(selectLanguage(['de', 'en'], 'de', 'fr')).toBe('de');
  });

  // Scenario: a tenant enables a single language that differs from the browser language.
  // The global default ('de') is NOT enabled, so we must still land on the one enabled language,
  // never on the disabled default.
  it('single enabled language different from the browser language → uses that one language', () => {
    (getBrowserLang as any).mockReturnValue('de');
    expect(selectLanguage(['fr'], 'de', undefined)).toBe('fr');
  });

  // Scenario: browser language matches no enabled language.
  it('browser language matches nothing and the default is disabled → first enabled language', () => {
    (getBrowserLang as any).mockReturnValue('es');
    expect(selectLanguage(['fr', 'it'], 'de', undefined)).toBe('fr');
  });

  it('browser language matches nothing but the default is enabled → the default', () => {
    (getBrowserLang as any).mockReturnValue('es');
    expect(selectLanguage(['de', 'fr'], 'de', undefined)).toBe('de');
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