import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTranslation = vi.fn();
const mockGetActiveLang = vi.fn(() => 'de');
const mockLangChanges$ = of('de');
const mockLoad = vi.fn(() => of({}));

vi.mock('@jsverse/transloco', () => ({
  TranslocoService: class {},
}));

vi.mock('@bk2/shared-models', () => ({
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
    searchData: vi.fn(() => of(overrides)),
  };
  const appStore = {
    currentUser: vi.fn(() => ({ bkey: 'u1' })),
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

  it('should skip overrides with no value for the requested language', () => {
    const override = { module: 'chat/feature', key: 'fields.reconnecting', de: '', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).not.toHaveBeenCalled();
  });
});
