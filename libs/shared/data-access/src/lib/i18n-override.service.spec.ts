import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTranslation = vi.fn();
const mockSetActiveLang = vi.fn();
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

function makeService(overrides: unknown[] = [], langChanges$: Observable<string> = mockLangChanges$) {
  const translocoService = {
    getActiveLang: mockGetActiveLang,
    setTranslation: mockSetTranslation,
    setActiveLang: mockSetActiveLang,
    langChanges$,
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
      { merge: true, emitChange: false, scope: 'chat/feature' },
    );
  });

  it('should call setTranslation for a legacy (root) override', () => {
    const override = { module: 'chat', key: 'fields.reconnecting', de: 'Verbindet…', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).toHaveBeenCalledWith(
      { 'chat.fields.reconnecting': 'Verbindet…' },
      'de',
      { merge: true, emitChange: false },
    );
  });

  // Performance (2026-09-09, perf-baselines.md »Der Firestore-Snapshot-Task war Transloco«): every
  // setTranslation with emitChange re-emits langChanges$, and every selectTranslate subscriber in
  // the app (hundreds: menu labels, section titles …) re-translates on each emit. Seven override
  // docs meant seven app-wide re-translations per snapshot — ~150 ms observed, ~600 ms simulated
  // TBT. Apply all overrides silently, then emit exactly once.
  it('should emit the language change once per snapshot, not once per override', () => {
    const overrides = ['a', 'b', 'c'].map((k) => ({ module: 'chat', key: k, de: k.toUpperCase(), isArchived: false }));
    const { svc } = makeService(overrides);
    svc.applyOverrides('de');
    expect(mockSetTranslation).toHaveBeenCalledTimes(3);
    for (const call of mockSetTranslation.mock.calls) expect(call[2]).toMatchObject({ emitChange: false });
    expect(mockSetActiveLang).toHaveBeenCalledTimes(1);
    expect(mockSetActiveLang).toHaveBeenCalledWith('de');
  });

  it('should not emit at all when no override has a value for the language', () => {
    const { svc } = makeService([{ module: 'chat', key: 'a', de: '', isArchived: false }]);
    svc.applyOverrides('de');
    expect(mockSetActiveLang).not.toHaveBeenCalled();
  });

  // Firestore delivers the cache snapshot first and the server snapshot right after; on a cold
  // dashboard both carry the same seven documents. The second pass did the whole re-translation
  // again for nothing.
  it('should ignore a second snapshot with identical content', () => {
    const snapshots$ = new Subject<unknown[]>();
    const { svc, firestoreService } = makeService();
    firestoreService.searchData.mockImplementation(() => snapshots$);
    svc.applyOverrides('de');
    const docs = [{ module: 'chat', key: 'a', de: 'A', isArchived: false }];
    snapshots$.next(docs);
    snapshots$.next(docs.map((d) => ({ ...d })));
    expect(mockSetTranslation).toHaveBeenCalledTimes(1);
    expect(mockSetActiveLang).toHaveBeenCalledTimes(1);
    snapshots$.next([{ module: 'chat', key: 'a', de: 'B', isArchived: false }]);
    expect(mockSetTranslation).toHaveBeenCalledTimes(2);
    expect(mockSetActiveLang).toHaveBeenCalledTimes(2);
  });

  // Regression: the query used to filter on the scalar `tenantId` and leave `tenants`
  // unconstrained. The firestore rule gates this collection on resource.data.tenants,
  // and Firestore rejects a list query it cannot prove is rule-safe — so every login
  // logged "Missing or insufficient permissions".
  //
  // `array-contains-any [tenant, 'system']` since 2026-08-25 (getSystemQuery), which is still
  // exactly what the rule proves: belongsToTenant() accepts the caller's own tenant OR the
  // 'system' sentinel, so both members of the disjunction are rule-safe.
  it('should scope the query by the tenants array the firestore rule reads', () => {
    const { svc, firestoreService } = makeService();
    svc.applyOverrides('de');
    const [, dbQuery] = firestoreService.searchData.mock.calls[0];
    expect(dbQuery).toContainEqual({ key: 'tenants', operator: 'array-contains-any', value: ['scs', 'system'] });
    expect(dbQuery.some((q: { key: string }) => q.key === 'tenantId')).toBe(false);
  });

  // Regression: Transloco's setTranslation calls setActiveLang internally, which re-emits the
  // CURRENT language through langChanges$. Without distinctUntilChanged in init(), the first
  // applied override re-entered applyOverrides forever and froze the tab right after login.
  // The re-emit is capped at 100 here so a regression fails the assertion instead of hanging.
  it('should not re-enter applyOverrides when setTranslation re-emits the same language', () => {
    const override = { module: 'chat/feature', key: 'fields.reconnecting', de: 'Verbindet…', isArchived: false };
    const lang$ = new BehaviorSubject('de');
    let reEmits = 0;
    // The re-emit now comes from our own single setActiveLang per snapshot (Transloco's own
    // re-emit inside setTranslation is switched off with emitChange: false).
    mockSetActiveLang.mockImplementation((lang: string) => {
      if (reEmits++ < 100) lang$.next(lang);
    });
    const { svc } = makeService([override], lang$);
    svc.init();
    expect(mockSetTranslation.mock.calls.length).toBeLessThan(5);
  });

  it('should skip overrides with no value for the requested language', () => {
    const override = { module: 'chat/feature', key: 'fields.reconnecting', de: '', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).not.toHaveBeenCalled();
  });
});
