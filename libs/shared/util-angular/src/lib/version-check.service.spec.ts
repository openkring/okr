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
}));

vi.mock('./platform.util', () => ({
  isBrowser: vi.fn(() => true),
}));

import { inject, PLATFORM_ID } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { SwUpdate } from '@angular/service-worker';
import { FIRESTORE } from '@okr/shared-config';
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
});
