import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';

const ensureAppCheckTokenMock = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

// Keep the real ENV injection token; only the attestation pre-flight is stubbed.
vi.mock('@okr/shared-config', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, ensureAppCheckToken: () => ensureAppCheckTokenMock() };
});

vi.mock('@okr/shared-util-angular', () => ({
  isBrowser: () => true,
  getBrowser: () => 'chrome',
  isIOS: () => false,
  isAndroid: () => false,
  isMacOS: () => true,
  isSafari: () => false,
}));

import { SessionService } from './session.service';

const createModelMock = vi.fn<() => Promise<string | undefined>>();

function makeService(): SessionService {
  TestBed.configureTestingModule({
    providers: [
      SessionService,
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: ENV, useValue: { tenantId: 'elab', firebase: { projectId: 'bkaiser-org' } } },
      { provide: FirestoreService, useValue: { createModel: () => createModelMock() } },
    ],
  });
  return TestBed.inject(SessionService);
}

describe('SessionService.startSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    createModelMock.mockResolvedValue('s1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the session once attestation succeeds', async () => {
    ensureAppCheckTokenMock.mockResolvedValue(true);
    const svc = makeService();

    await svc.startSession();

    expect(createModelMock).toHaveBeenCalledTimes(1);
    expect(svc.hasActiveSession).toBe(true);
  });

  // Writing without an App Check token is what produced the PERMISSION_DENIED noise (SCS-8M):
  // the SDK sends a placeholder token and Firestore rejects the write without retrying it.
  it('does not write while attestation is unavailable, and retries after the backoff', async () => {
    ensureAppCheckTokenMock.mockResolvedValueOnce(false).mockResolvedValue(true);
    const svc = makeService();

    const pending = svc.startSession();
    await vi.advanceTimersByTimeAsync(0);
    expect(createModelMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    await pending;

    expect(createModelMock).toHaveBeenCalledTimes(1);
    expect(svc.hasActiveSession).toBe(true);
  });

  it('gives up without writing when attestation never succeeds', async () => {
    ensureAppCheckTokenMock.mockResolvedValue(false);
    const svc = makeService();

    const pending = svc.startSession();
    await vi.advanceTimersByTimeAsync(12000);
    await pending;

    expect(createModelMock).not.toHaveBeenCalled();
    expect(svc.hasActiveSession).toBe(false);
  });

  // With a valid token a rejection is a genuine failure — FirestoreService already reported it,
  // so a retry would only report it a second and third time.
  it('does not retry a write that failed despite a valid token', async () => {
    ensureAppCheckTokenMock.mockResolvedValue(true);
    createModelMock.mockResolvedValue(undefined);
    const svc = makeService();

    const pending = svc.startSession();
    await vi.advanceTimersByTimeAsync(12000);
    await pending;

    expect(createModelMock).toHaveBeenCalledTimes(1);
    expect(svc.hasActiveSession).toBe(false);
  });
});
