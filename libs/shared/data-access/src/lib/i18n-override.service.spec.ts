import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTranslation = vi.fn();
const mockGetActiveLang = vi.fn(() => 'de');
const mockLangChanges$ = of('de');
const mockLoad = vi.fn(() => of({}));

vi.mock('@jsverse/transloco', () => ({
  TranslocoService: class {},
}));

// Partial mock: only the collection name is pinned. Replacing the whole module breaks any
// transitive importer that reads another export at module-eval time (e.g. shared-util-core's
// photo-declaration.util reading PrivacyUsage).
vi.mock('@okr/shared-models', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@okr/shared-models')>()),
  I18nTenantOverrideCollection: 'i18nTenantOverride',
}));

import { I18nOverrideService } from './i18n-override.service';

function makeService(overrides: unknown[] = []) {
  const translocoService = {
    getActiveLang: mockGetActiveLang,
    setTranslation: mockSetTranslation,
    langChanges$: mockLangChanges$,
    load: mockLoad,
  };
  const firestoreService = {
    searchData: vi.fn(
      (_collection: string, _dbQuery: { key: string; operator: string; value: unknown }[], _orderBy?: string, _sortOrder?: string) =>
        of(overrides),
    ),
  };
  const appStore = {
    currentUser: vi.fn(() => ({ okey: 'u1' })),
    env: { tenantId: 'scs' },
  };
  const svc = new I18nOverrideService(
    translocoService as any,
    firestoreService as any,
    appStore as any,
  );
  return { svc, translocoService, firestoreService };
}

describe('I18nOverrideService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    const { svc } = makeService();
    expect(svc).toBeDefined();
  });

  it('should call setTranslation for a scoped override', () => {
    const override = { module: 'chat/feature', key: 'fields.reconnecting', de: 'Verbindet…', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).toHaveBeenCalledWith(
      { 'fields.reconnecting': 'Verbindet…' },
      'de',
      { merge: true, scope: 'chat/feature' },
    );
  });

  it('should call setTranslation for a legacy (root) override', () => {
    const override = { module: 'chat', key: 'fields.reconnecting', de: 'Verbindet…', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).toHaveBeenCalledWith(
      { 'chat.fields.reconnecting': 'Verbindet…' },
      'de',
      { merge: true },
    );
  });

  // Regression: the query used to filter on the scalar `tenantId` and leave `tenants`
  // unconstrained. The firestore rule gates this collection on resource.data.tenants,
  // and Firestore rejects a list query it cannot prove is rule-safe — so every login
  // logged "Missing or insufficient permissions".
  it('should scope the query by the tenants array the firestore rule reads', () => {
    const { svc, firestoreService } = makeService();
    svc.applyOverrides('de');
    const [, dbQuery] = firestoreService.searchData.mock.calls[0];
    expect(dbQuery).toContainEqual({ key: 'tenants', operator: 'array-contains', value: 'scs' });
    expect(dbQuery.some((q: { key: string }) => q.key === 'tenantId')).toBe(false);
  });

  it('should skip overrides with no value for the requested language', () => {
    const override = { module: 'chat/feature', key: 'fields.reconnecting', de: '', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).not.toHaveBeenCalled();
  });
});
