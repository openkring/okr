import { describe, expect, it } from 'vitest';
import { AvailableLanguages, DefaultLanguage, DefaultLanguageCode, Language } from './language.enum';

describe('language.enum', () => {
  it('AvailableLanguages is index-aligned with the Language enum (do not reorder)', () => {
    expect(AvailableLanguages[Language.GE]).toBe('de');
    expect(AvailableLanguages[Language.EN]).toBe('en');
    expect(AvailableLanguages[Language.FR]).toBe('fr');
    expect(AvailableLanguages[Language.ES]).toBe('es');
    expect(AvailableLanguages[Language.IT]).toBe('it');
  });

  it('DefaultLanguageCode is the code of the DefaultLanguage', () => {
    expect(DefaultLanguageCode).toBe('de');
    expect(DefaultLanguageCode).toBe(AvailableLanguages[DefaultLanguage]);
  });
});
