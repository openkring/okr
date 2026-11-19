import { describe, expect, it } from 'vitest';

import { AppConfig } from '@okr/shared-models';

import {
  COOKIE_BANNER_TEXT_LENGTH,
  CookieBannerSettings,
  cookieBannerSettingsValidations,
  fromCookieBannerSettings,
  toCookieBannerSettings,
} from './cookie-banner-settings.validations';

const settings = (over: Partial<CookieBannerSettings> = {}): CookieBannerSettings => ({
  cookieBannerEnabled: false,
  text_de: '', text_en: '', text_fr: '', text_es: '', text_it: '',
  ...over,
});

describe('toCookieBannerSettings', () => {
  it('reads a legacy config without the fields as off and empty', () => {
    expect(toCookieBannerSettings({} as Partial<AppConfig>)).toEqual(settings());
    expect(toCookieBannerSettings(undefined)).toEqual(settings());
  });

  it('flattens the per-language map', () => {
    const config = { cookieBannerEnabled: true, cookieBannerText: { de: 'Hallo', it: 'Ciao' } } as Partial<AppConfig>;
    expect(toCookieBannerSettings(config)).toEqual(settings({ cookieBannerEnabled: true, text_de: 'Hallo', text_it: 'Ciao' }));
  });
});

describe('fromCookieBannerSettings', () => {
  it('writes every language, an emptied one as empty string, trimmed', () => {
    expect(fromCookieBannerSettings(settings({ cookieBannerEnabled: true, text_de: '  Hallo  ' }))).toEqual({
      cookieBannerEnabled: true,
      cookieBannerText: { de: 'Hallo', en: '', fr: '', es: '', it: '' },
    });
  });

  it('round-trips through toCookieBannerSettings', () => {
    const s = settings({ cookieBannerEnabled: true, text_fr: 'Bonjour' });
    expect(toCookieBannerSettings(fromCookieBannerSettings(s))).toEqual(s);
  });
});

describe('cookieBannerSettingsValidations', () => {
  it('accepts empty texts (the default text is used)', () => {
    expect(cookieBannerSettingsValidations(settings()).isValid()).toBe(true);
  });

  it('accepts a text of exactly the maximum length', () => {
    const text = 'x'.repeat(COOKIE_BANNER_TEXT_LENGTH);
    expect(cookieBannerSettingsValidations(settings({ text_de: text })).isValid()).toBe(true);
  });

  it('rejects a text that is too long, filed under its own field', () => {
    const text = 'x'.repeat(COOKIE_BANNER_TEXT_LENGTH + 1);
    const result = cookieBannerSettingsValidations(settings({ text_en: text }));
    expect(result.isValid()).toBe(false);
    expect(result.hasErrors('text_en')).toBe(true);
    expect(result.hasErrors('text_de')).toBe(false);
  });
});
