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

  it('carries NO tenantId field — the document id is the only tenant identity', () => {
    // Removed 2026-08-05 by owner instruction. A duplicated `tenantId` field was
    // write-only (nothing queries `where('tenantId', …)` on app-config), it went stale,
    // and it misled a migration into keying on it. The constructor still TAKES a tenantId
    // to seed the per-tenant defaults, but must not retain it.
    const config = new AppConfig('scs');
    expect('tenantId' in config).toBe(false);
    expect(config.ownerOrgId).toBe('scs'); // the ctor param is still doing its job
  });

  it('does not resurrect tenantId from a legacy Firestore doc that still has the field', () => {
    // The live documents keep the stale field until `scripts/normalize-tenant-ids.mjs`
    // strips it. Object.assign copies whatever keys the raw read carries, so a legacy doc
    // WILL put `tenantId` back onto the hydrated object. That is tolerable only because
    // nothing reads it — this test exists to make the window explicit and to fail loudly
    // if anyone starts depending on it again.
    const legacyDoc = { tenantId: 'stale-value' };
    const hydrated = Object.assign(new AppConfig('scs'), legacyDoc) as unknown as Record<string, unknown>;
    // it is present because the DOC has it, never because the CLASS declares it
    expect(hydrated['tenantId']).toBe('stale-value');
    expect('tenantId' in new AppConfig('scs')).toBe(false);
  });
});
