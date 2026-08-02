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

  it('leaves enabledFeatures undefined for a legacy doc with no such key, through the ' +
    'same Object.assign hydration AppStore.appConfig() performs (app.store.ts)', () => {
    // Pins the composition, not just the class default: a legacy Firestore read has no
    // `enabledFeatures` key at all, so Object.assign(new AppConfig(...), loaded) must not
    // resurrect a `[]` default — effectiveFeatures()'s `enabled === undefined` branch
    // (D-BB-10, "every non-internal block") depends on this staying undefined.
    const legacyDoc = {}; // simulates a raw searchData()/docData() read of a pre-existing doc
    const hydrated = Object.assign(new AppConfig('scs'), legacyDoc);
    expect(hydrated.enabledFeatures).toBeUndefined();
  });

  it('still lets an explicit empty array ("nothing enabled") survive hydration', () => {
    const explicitlyEmptyDoc = { enabledFeatures: [] as string[] };
    const hydrated = Object.assign(new AppConfig('scs'), explicitlyEmptyDoc);
    expect(hydrated.enabledFeatures).toEqual([]);
  });
});
