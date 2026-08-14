import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';
import type { UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';

// Mock Angular's inject and all Angular DI before importing the service
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return {
    ...actual,
    inject: vi.fn(),
  };
});

vi.mock('@ionic/angular/standalone', () => ({
  AlertController: class AlertController {},
}));

vi.mock('@angular/service-worker', () => ({
  SwUpdate: class SwUpdate {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('@okr/shared-config', () => ({
  FIRESTORE: Symbol('FIRESTORE'),
  ENV: Symbol('ENV'),
}));

vi.mock('./platform.util', () => ({
  isBrowser: vi.fn(() => true),
}));

import { inject, PLATFORM_ID } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { SwUpdate } from '@angular/service-worker';
import { ENV, FIRESTORE } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';

import packageJson from '../../../../../package.json';
import type { AppVersionConfig } from './version-check.service';
import { UNRECOVERABLE_RELOAD_KEY, VersionCheckService } from './version-check.service';

describe('VersionCheckService unrecoverable-state handling', () => {
  const mockAlertController = { create: vi.fn() };
  // fresh per test (see makeService) so emissions never reach service instances of previous tests
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let mockSwUpdate: {
    isEnabled: boolean;
    versionUpdates: Subject<VersionEvent>;
    unrecoverable: Subject<UnrecoverableStateEvent>;
    checkForUpdate: ReturnType<typeof vi.fn>;
    activateUpdate: ReturnType<typeof vi.fn>;
  };

  function makeService(): { service: VersionCheckService; reloadSpy: ReturnType<typeof vi.spyOn> } {
    (inject as ReturnType<typeof vi.fn>).mockImplementation((token: unknown) => {
      if (token === AlertController) return mockAlertController;
      if (token === SwUpdate) return mockSwUpdate;
      if (token === PLATFORM_ID) return 'browser';
      if (token === FIRESTORE) return {};
      if (token === ENV) return { appId: 'p13' };
      // the update alert resolves its labels through translateAll (main-bundle keys)
      if (token === I18nService) return { translateAll: (keys: Record<string, string>) =>
        Object.fromEntries(Object.keys(keys).map(k => [k, () => k])) };
      return undefined;
    });
    const service = new VersionCheckService();
    const reloadSpy = vi
      .spyOn(service as unknown as { reloadPage(): void }, 'reloadPage')
      .mockImplementation(() => undefined);
    service.checkVersion();
    return { service, reloadSpy };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    unrecoverable = new Subject<UnrecoverableStateEvent>();
    mockSwUpdate = {
      isEnabled: true,
      versionUpdates: new Subject<VersionEvent>(),
      unrecoverable,
      checkForUpdate: vi.fn().mockResolvedValue(false),
      activateUpdate: vi.fn().mockResolvedValue(true),
    };
  });

  it('reloads the page when the service worker reports an unrecoverable state', () => {
    const { reloadSpy } = makeService();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'Hash mismatch' });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('records the reload timestamp in sessionStorage', () => {
    makeService();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'Hash mismatch' });
    expect(Number(sessionStorage.getItem(UNRECOVERABLE_RELOAD_KEY))).toBeGreaterThan(0);
  });

  it('does not reload again within the loop-guard interval', () => {
    const { reloadSpy } = makeService();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'Hash mismatch' });
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'Hash mismatch' });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the service worker is disabled', () => {
    mockSwUpdate.isEnabled = false;
    const { reloadSpy } = makeService();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'Hash mismatch' });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  // Apps release on their own cadence, so the fleet-wide latestVersion is the wrong number to show
  // to an app that is behind (or ahead) of it — deployed[appId] wins when it is there.
  describe('getLatestVersion', () => {
    const setConfig = (service: VersionCheckService, config: AppVersionConfig) => {
      (service as unknown as { versionConfig?: AppVersionConfig }).versionConfig = config;
    };

    it('prefers the version deployed for this app', () => {
      const { service } = makeService();               // appId 'p13'
      setConfig(service, { minVersion: '7.0.0', latestVersion: '7.11.1', deployed: { scs: '7.11.1', p13: '7.12.0' } });
      expect(service.getLatestVersion()).toBe('7.12.0');
    });

    it('falls back to latestVersion when this app has no entry', () => {
      const { service } = makeService();
      setConfig(service, { minVersion: '7.0.0', latestVersion: '7.11.1', deployed: { scs: '7.11.1' } });
      expect(service.getLatestVersion()).toBe('7.11.1');
    });

    it('falls back to latestVersion when there is no deployed map at all', () => {
      const { service } = makeService();
      setConfig(service, { minVersion: '7.0.0', latestVersion: '7.11.1' });
      expect(service.getLatestVersion()).toBe('7.11.1');
    });

    // `deployed.<appId>` is set by hand AFTER the hosting deploy, so a client can get
    // VERSION_READY while the doc still names the version it is already running.
    describe('the update prompt', () => {
      const promptMessage = async (configured: string, appData?: Record<string, string>): Promise<string> => {
        const { service } = makeService();
        setConfig(service, { minVersion: '7.0.0', latestVersion: configured, deployed: { p13: configured } });
        mockAlertController.create.mockResolvedValue({
          present: vi.fn(), onWillDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
        });
        mockSwUpdate.versionUpdates.next(
          { type: 'VERSION_READY', latestVersion: { hash: 'h', appData } } as unknown as VersionEvent);
        await vi.waitFor(() => expect(mockAlertController.create).toHaveBeenCalled());
        return mockAlertController.create.mock.calls[0][0].message;
      };

      it('does not quote a configured version that is not newer than the running one', async () => {
        expect(await promptMessage(packageJson.version)).toBe('message');
      });

      it('quotes the configured version when it really is newer', async () => {
        expect(await promptMessage('99.0.0')).toBe('messageWithVersion');
      });

      it('prefers the incoming build version from the ngsw manifest over the lagging doc', async () => {
        expect(await promptMessage(packageJson.version, { version: '99.0.0' })).toBe('messageWithVersion');
      });
    });
  });
});
