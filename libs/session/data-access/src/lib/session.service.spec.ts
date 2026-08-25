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
const updateModelMock = vi.fn<() => Promise<string | undefined>>();

function makeService(): SessionService {
  TestBed.configureTestingModule({
    providers: [
      SessionService,
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: ENV, useValue: { tenantId: 'elab', firebase: { projectId: 'bkaiser-org' } } },
      {
        provide: FirestoreService,
        useValue: { createModel: () => createModelMock(), updateModel: () => updateModelMock() },
      },
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
    updateModelMock.mockResolvedValue('s1');
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

describe('SessionService update writes', () => {
  const fetchMock = vi.fn(() => Promise.resolve({} as Response));

  /** A started session, so the update paths have something to write. */
  async function startedService(): Promise<SessionService> {
    ensureAppCheckTokenMock.mockResolvedValue(true);
    const svc = makeService();
    await svc.startSession();
    ensureAppCheckTokenMock.mockReset();
    return svc;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    createModelMock.mockResolvedValue('s1');
    updateModelMock.mockResolvedValue('s1');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes the login upgrade when attestation succeeds', async () => {
    const svc = await startedService();
    ensureAppCheckTokenMock.mockResolvedValue(true);

    await svc.upgradeSession({ okey: 'u1', loginEmail: 'a@b.ch' } as never);

    expect(updateModelMock).toHaveBeenCalledTimes(1);
  });

  // Skipping is safe: userKey/userEmail are on the in-memory session and the next heartbeat
  // carries them — unlike a write without a token, which is rejected and lost.
  it('skips the login upgrade without a token', async () => {
    const svc = await startedService();
    ensureAppCheckTokenMock.mockResolvedValue(false);

    await svc.upgradeSession({ okey: 'u1', loginEmail: 'a@b.ch' } as never);

    expect(updateModelMock).not.toHaveBeenCalled();
  });

  it('skips a heartbeat without a token and writes the next one', async () => {
    await startedService();
    ensureAppCheckTokenMock.mockResolvedValueOnce(false).mockResolvedValue(true);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(updateModelMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(updateModelMock).toHaveBeenCalledTimes(1);
  });

  it('writes the session end when attestation succeeds', async () => {
    const svc = await startedService();
    ensureAppCheckTokenMock.mockResolvedValue(true);

    await svc.endSession();

    expect(updateModelMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // On unload there is no time to back off, so the close-out goes to the endSession function.
  it('falls back to the beacon when the session end has no token', async () => {
    const svc = await startedService();
    ensureAppCheckTokenMock.mockResolvedValue(false);

    await svc.endSession();

    expect(updateModelMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
