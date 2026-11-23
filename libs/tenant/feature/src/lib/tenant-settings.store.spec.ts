import { provideZonelessChangeDetection, signal } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';

import { ActivityService } from '@okr/activity-data-access';
import { AppConfigService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import type { TenantSettings } from '@okr/tenant-util';
import { AlertService } from '@okr/shared-util-angular';

import { TenantSettingsStore } from './tenant-settings.store';

const ADMIN = { roles: { admin: true } };
const REGISTERED = { roles: { registered: true } };

/** `createApplication`, not `TestBed`: the barrels pulled in here make TestBed die with «reading 'ngModule'» (see feature-enabled.guard.spec.ts). */
async function setup(opts: { user?: unknown; tenantId?: string; loaded?: boolean } = {}) {
  const patch = vi.fn(async (..._a: unknown[]) => 't' as string | undefined);
  const log = vi.fn(async (..._a: unknown[]) => 'a' as string | undefined);
  const confirm = vi.fn(async (..._a: unknown[]) => true);
  const loaded = opts.loaded ?? true;
  const app = await createApplication({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AppStore, useValue: {
        currentUser: signal('user' in opts ? opts.user : ADMIN),
        tenantId: signal(opts.tenantId ?? 'scs'),
        appConfig: signal({}),
        isAppConfigSettled: signal(loaded),
        appConfigResource: { hasValue: () => loaded },
      } },
      { provide: AppConfigService, useValue: { patch } },
      { provide: ActivityService, useValue: { log } },
      { provide: AlertService, useValue: { confirm } },
      { provide: I18nService, useValue: { translateAll: (k: Record<string, string>) => Object.fromEntries(Object.keys(k).map((n) => [n, () => `t:${n}`])) } },
    ],
  });
  return { store: app.injector.get(TenantSettingsStore), patch, log, confirm };
}

const t = (v: Record<string, unknown>) => v as TenantSettings;

describe('TenantSettingsStore.save', () => {
  it('writes only the changed fields of the group and logs them', async () => {
    const { store, patch, log } = await setup();
    expect(await store.save('app', t({ appName: 'A', appTitle: 'x' }), t({ appName: 'B', appTitle: 'x', showEmail: 'public' }))).toBe(true);
    expect(patch).toHaveBeenCalledWith('scs', { appName: 'B' });
    expect(log).toHaveBeenCalledWith('tenant', 'settings', ADMIN, 'appName');
  });

  it('writes nothing for an unchanged group', async () => {
    const { store, patch, log } = await setup();
    expect(await store.save('app', t({ appName: 'A' }), t({ appName: 'A' }))).toBe(false);
    expect(patch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('refuses a non-admin', async () => {
    const { store, patch } = await setup({ user: REGISTERED });
    expect(await store.save('app', t({ appName: 'A' }), t({ appName: 'B' }))).toBe(false);
    expect(patch).not.toHaveBeenCalled();
  });

  it('refuses platform for a non-operator, allows it for the operator', async () => {
    const a = await setup();
    expect(await a.store.save('platform', t({ gitOrg: 'a' }), t({ gitOrg: 'b' }))).toBe(false);
    expect(a.patch).not.toHaveBeenCalled();
    const b = await setup({ tenantId: 'bka' });
    expect(await b.store.save('platform', t({ gitOrg: 'a' }), t({ gitOrg: 'b' }))).toBe(true);
  });

  it('refuses a foreign tenant unless operator and platform', async () => {
    const a = await setup();
    expect(await a.store.save('app', t({ appName: 'A' }), t({ appName: 'B' }), 'kwa')).toBe(false);
    const b = await setup({ tenantId: 'bka' });
    expect(await b.store.save('app', t({ appName: 'A' }), t({ appName: 'B' }), 'kwa')).toBe(false);
    expect(await b.store.save('platform', t({ gitOrg: 'a' }), t({ gitOrg: 'b' }), 'kwa')).toBe(true);
    expect(b.patch).toHaveBeenCalledWith('kwa', { gitOrg: 'b' });
    expect(b.log).toHaveBeenCalledWith('tenant', 'settings', ADMIN, 'kwa: gitOrg');
  });

  it('asks once and saves nothing when cancelled', async () => {
    const { store, patch, confirm } = await setup();
    confirm.mockResolvedValue(false);
    expect(await store.save('privacy', t({ showEmail: 'admin' }), t({ showEmail: 'public' }))).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(patch).not.toHaveBeenCalled();
  });

  it('returns false and logs nothing when the write fails', async () => {
    const { store, patch, log } = await setup();
    patch.mockResolvedValue(undefined);
    expect(await store.save('app', t({ appName: 'A' }), t({ appName: 'B' }))).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('does not wait for, or fail on, the activity log', async () => {
    const { store, log } = await setup();
    log.mockReturnValue(new Promise(() => undefined));
    expect(await store.save('app', t({ appName: 'A' }), t({ appName: 'B' }))).toBe(true);
    log.mockRejectedValue(new Error('x'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await store.save('app', t({ appName: 'A' }), t({ appName: 'C' }))).toBe(true);
    await Promise.resolve();
    warn.mockRestore();
  });

  it('refuses while the app-config is not loaded', async () => {
    const { store, patch } = await setup({ loaded: false });
    expect(store.isLoaded()).toBe(false);
    expect(await store.save('app', t({ appName: 'A' }), t({ appName: 'B' }))).toBe(false);
    expect(patch).not.toHaveBeenCalled();
  });
});
