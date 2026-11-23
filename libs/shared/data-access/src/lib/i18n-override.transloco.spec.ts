import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreService } from './firestore.service';
import { APP_STORE_MIN, I18nOverrideService } from './i18n-override.service';

// The real TranslocoService: the mocked spec cannot see whether an override ends up where it is read.
const SCOPE = 'subject/address/feature';
const BUNDLE = { address_channel: { email: { label: 'E-Mail' } } };
const getTranslation = vi.fn((path: string) => of(path === SCOPE + '/de' ? BUNDLE : { save: { label: 'Sichern' } }));

function setup(rows: { module: string; key: string; de: string }[]) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideTransloco({
        config: { availableLangs: ['de', 'en'], defaultLang: 'de', prodMode: true },
        loader: class { public readonly getTranslation = getTranslation; },
      }),
      { provide: FirestoreService, useValue: { searchData: () => of(rows) } },
      { provide: APP_STORE_MIN, useValue: { currentUser: () => ({ okey: 'u1' }), env: { tenantId: 'scs' } } },
    ],
  });
  const transloco = TestBed.inject(TranslocoService);
  return {
    transloco,
    service: TestBed.inject(I18nOverrideService),
    // the way I18nService.translate reads a scoped key
    read: async (key: string) => {
      await firstValueFrom(transloco.load(`${SCOPE}/de`));
      return firstValueFrom(transloco.selectTranslate(key, {}, SCOPE));
    },
  };
}

describe('I18nOverrideService with the real Transloco', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  const pager = { module: SCOPE, key: 'address_channel.pager.label', de: 'Pager' };

  it('shows a new key of a path scope when the scope loads after the rows', async () => {
    const { service, read } = setup([pager]);
    service.applyOverrides('de');
    expect(await read(pager.key)).toBe('Pager');
  });

  it('shows a new key of a path scope when the scope is already loaded', async () => {
    const { service, read } = setup([pager]);
    await read('address_channel.email.label');
    service.applyOverrides('de');
    expect(await read(pager.key)).toBe('Pager');
  });

  it('does not make Transloco take the scope for loaded: its bundle is still fetched', async () => {
    const { service, read } = setup([pager]);
    service.applyOverrides('de');
    expect(getTranslation).not.toHaveBeenCalled();
    expect(await read('address_channel.email.label')).toBe('E-Mail');
    expect(getTranslation.mock.calls.map(call => call[0])).toContain(`${SCOPE}/de`);
  });

  it('does not make Transloco take the main language for loaded', async () => {
    const { service, transloco } = setup([pager]);
    service.applyOverrides('de');
    expect(await firstValueFrom(transloco.selectTranslate('save.label'))).toBe('Sichern');
  });

  it('replaces a key of a bundle that is already loaded', async () => {
    const { service, read } = setup([{ module: SCOPE, key: 'address_channel.email.label', de: 'Mail' }]);
    await read('address_channel.email.label');
    service.applyOverrides('de');
    expect(await read('address_channel.email.label')).toBe('Mail');
  });

  it('shows a root key', async () => {
    const { service, transloco } = setup([{ module: 'tag', key: 'club', de: 'Anlass' }]);
    service.applyOverrides('de');
    expect(await firstValueFrom(transloco.selectTranslate('tag.club'))).toBe('Anlass');
  });
});
