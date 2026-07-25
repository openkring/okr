import { describe, expect, it } from 'vitest';
import { AppConfig } from './app-config.model';
import { AvailableLanguages } from './enums/language.enum';

describe('AppConfig', () => {
  it('defaults enabledLanguages to all supported languages', () => {
    const config = new AppConfig('scs');
    expect(config.enabledLanguages).toEqual(AvailableLanguages);
    // must be a copy, not the shared array reference
    expect(config.enabledLanguages).not.toBe(AvailableLanguages);
  });
});
