import { describe, expect, it } from 'vitest';
import {
  findTenantVocabularyDrift, formatDrift, scanCollections, type ModelSourceFile,
} from './tenant-scope.util';

// ─────────────────────────────────────────────────────────────────────────────────────
// COLLECTION DERIVATION
//
// The fixtures below are cut down from the real files in `libs/shared/models/src/lib`;
// each one is the reason a rung of the association ladder exists.
// ─────────────────────────────────────────────────────────────────────────────────────

const f = (file: string, source: string): ModelSourceFile => ({ file, source });

const PERSON = f('person.model.ts', `
import { DEFAULT_TENANTS } from '@okr/shared-constants';
export class PersonModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
}
export const PersonCollection = 'persons';
`);

// Two constants, two models, names line up — only a per-constant name match gets this right.
const PDF_TEMPLATE = f('pdf-template.model.ts', `
export const TemplateCollection = 'templates';
export const DocGenerationCollection = 'docGenerations';
export interface TemplateAssetRef { url: string; }
export class TemplateModel implements OkrModel {
  public tenants: string[] = DEFAULT_TENANTS;
}
export class TemplateVersionModel { public version = 1; }
export class DocGenerationModel implements OkrModel {
  public tenants: string[] = DEFAULT_TENANTS;
}
`);

// Constant prefix and model name deliberately differ — rung 2.
const CATEGORY = f('category-list.model.ts', `
export class CategoryListModel implements OkrModel {
  public tenants: string[] = DEFAULT_TENANTS;
}
export class CategoryItemModel { public name = ''; }
export const CategoryCollection = 'categories';
`);

// Not tenant-scoped at all — rung 0.
const ESIGN = f('esign.model.ts', `
export interface EsignSignee { email: string; }
export interface EsignRecord { okey: string; }
export const EsignCollection = 'esignList';
export const EsignAuditCollection = 'esignAudit';
`);

describe('scanCollections', () => {
  it('scopes a collection whose name-matching model declares tenants', () => {
    const scan = scanCollections([PERSON]);
    expect(scan.scoped).toEqual([
      { collection: 'persons', constName: 'PersonCollection', file: 'person.model.ts', via: 'name-match' },
    ]);
    expect(scan.unscoped).toEqual([]);
    expect(scan.ambiguous).toEqual([]);
  });

  it('resolves two collections in ONE file independently, by name', () => {
    const scan = scanCollections([PDF_TEMPLATE]);
    expect(scan.scoped.map(s => s.collection)).toEqual(['docGenerations', 'templates']);
    expect(scan.scoped.every(s => s.via === 'name-match')).toBe(true);
    expect(scan.ambiguous).toEqual([]);
  });

  it('falls back to the sole tenant-carrying model when the names differ', () => {
    const scan = scanCollections([CATEGORY]);
    expect(scan.scoped).toEqual([
      { collection: 'categories', constName: 'CategoryCollection', file: 'category-list.model.ts', via: 'sole-model-in-file' },
    ]);
  });

  it('excludes a file in which nothing declares tenants, and says why', () => {
    const scan = scanCollections([ESIGN]);
    expect(scan.scoped).toEqual([]);
    expect(scan.unscoped.map(u => u.collection)).toEqual(['esignAudit', 'esignList']);
    expect(scan.unscoped[0].reason).toMatch(/no declaration/);
  });

  it('REFUSES to guess when a file has several collections and no name match', () => {
    const scan = scanCollections([f('mystery.model.ts', `
      export const AlphaCollection = 'alphas';
      export const BetaCollection = 'betas';
      export class SomethingElse implements OkrModel {
        public tenants: string[] = [];
      }
    `)]);
    expect(scan.scoped).toEqual([]);
    expect(scan.ambiguous.map(a => a.collection)).toEqual(['alphas', 'betas']);
    expect(scan.ambiguous[0].reason).toMatch(/cannot decide/);
  });

  it('surfaces a tenant-carrying model that has no collection constant at all', () => {
    const scan = scanCollections([f('base.model.ts', `
      export interface PersistedModel {
        tenants: string[];
        isArchived: boolean;
      }
    `)]);
    expect(scan.tenantModelsWithoutCollection).toEqual([
      { model: 'PersistedModel', file: 'base.model.ts' },
    ]);
    expect(scan.scoped).toEqual([]);
  });

  it('does not mistake the WORD "tenants" in a comment or import for a member', () => {
    const scan = scanCollections([f('exchange-rate.model.ts', `
      import { DEFAULT_TENANTS } from '@okr/shared-constants';
      // Exchange rates are shared across all accounting tenants within a okr-tenant.
      export class ExchangeRateModel { public rate = 1; }
      export const ExchangeRateCollection = 'exchange-rates';
    `)]);
    expect(scan.scoped).toEqual([]);
    expect(scan.unscoped.map(u => u.collection)).toEqual(['exchange-rates']);
  });

  it('recognises the UNANNOTATED member form `public tenants = DEFAULT_TENANTS`', () => {
    // Regression: requiring the `:` classified sixteen live collections — persons, orgs,
    // transfers, users, pages, resources … — as unscoped, and the migration would have
    // skipped every one of them silently. This is the majority form in the real models.
    const scan = scanCollections([f('transfer.model.ts', `
import { DEFAULT_TENANTS } from '@okr/shared-constants';
export class TransferModel implements OkrModel {
  public tenants = DEFAULT_TENANTS;
  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}
export const TransferCollection = 'transfers';
export const TransferModelName = 'transfer';
`)]);
    expect(scan.scoped.map(s => s.collection)).toEqual(['transfers']);
    expect(scan.unscoped).toEqual([]);
  });

  it('does not count a constructor assignment `this.tenants = …` as a member declaration', () => {
    const scan = scanCollections([f('thing.model.ts', `
export class ThingModel {
  public label = '';
  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}
export const ThingCollection = 'things';
`)]);
    expect(scan.scoped).toEqual([]);
    expect(scan.unscoped.map(u => u.collection)).toEqual(['things']);
  });

  it('reads a constant whose name contains digits (I18nDefaultCollection)', () => {
    const scan = scanCollections([f('i18n-default.model.ts', `
      export class I18nDefaultModel {
        public tenants: string[] = [];
      }
      export const I18nDefaultCollection = 'i18nDefault';
    `)]);
    expect(scan.scoped.map(s => s.collection)).toEqual(['i18nDefault']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// THE DRIFT GUARD
//
// These are the tests that must go RED when an unknown tenant id appears. The invariant
// is about live Firestore, which no unit test can read — so the census is the input and
// the judgement is what is pinned here. `scripts/normalize-tenant-ids.mjs` supplies a
// real census and exits non-zero on the same verdict.
// ─────────────────────────────────────────────────────────────────────────────────────

describe('findTenantVocabularyDrift', () => {
  const CONFIGS = ['bkg', 'kring', 'okr', 'p13', 'scs'];

  it('passes when every tenants[] id has an app-config document', () => {
    const drift = findTenantVocabularyDrift(CONFIGS, {
      persons: { scs: 612, p13: 15, kring: 1, okr: 1 },
      menuItems: { scs: 339, bkg: 64, okr: 8, kring: 8, p13: 63 },
    });
    expect(drift.ok).toBe(true);
    expect(drift.unknown).toEqual([]);
    expect(formatDrift(drift)).toMatch(/consistent/);
  });

  it('FAILS on a single unknown id, and says where it is', () => {
    const drift = findTenantVocabularyDrift(CONFIGS, {
      persons: { scs: 612, ghost: 2 },
      menuItems: { scs: 339, ghost: 62 },
    });
    expect(drift.ok).toBe(false);
    expect(drift.unknown).toEqual([
      {
        tenantId: 'ghost',
        totalDocs: 64,
        byCollection: [{ collection: 'menuItems', docs: 62 }, { collection: 'persons', docs: 2 }],
      },
    ]);
    const msg = formatDrift(drift);
    expect(msg).toContain('"ghost" — 64 doc(s) across 2 collection(s): menuItems:62, persons:2');
    expect(msg).toMatch(/Do NOT add the id to the guard's allowlist/);
  });

  it('orders unknown ids by blast radius so the destructive one is read first', () => {
    const drift = findTenantVocabularyDrift(CONFIGS, {
      resources: { big: 145, small: 1 },
      pages: { big: 22 },
    });
    expect(drift.unknown.map(u => u.tenantId)).toEqual(['big', 'small']);
  });

  it('ignores an id whose only occurrences are zero-document entries', () => {
    const drift = findTenantVocabularyDrift(CONFIGS, { pages: { phantom: 0, scs: 128 } });
    expect(drift.ok).toBe(true);
  });

  it('honours an explicit allowlist — and only an explicit one', () => {
    const census = { tags: { default: 35, scs: 35 } };
    expect(findTenantVocabularyDrift(CONFIGS, census).ok).toBe(false);
    expect(findTenantVocabularyDrift(CONFIGS, census, ['default']).ok).toBe(true);
  });

  it('reports an app-config id that no document claims, without failing', () => {
    const drift = findTenantVocabularyDrift(CONFIGS, { persons: { scs: 1 } });
    expect(drift.ok).toBe(true);
    expect(drift.configsWithoutContent).toEqual(['bkg', 'kring', 'okr', 'p13']);
  });

  it('is not fooled by an id that only exists in a collection nobody scans', () => {
    // Regression shape: the guard must judge the census it is GIVEN. If a collection is
    // missing from the census the guard cannot see its ids — which is precisely why the
    // script derives its collection list rather than hardcoding one.
    const drift = findTenantVocabularyDrift(CONFIGS, {});
    expect(drift.ok).toBe(true);
    expect(drift.unknown).toEqual([]);
  });
});
