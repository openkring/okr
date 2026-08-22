import type { AppCheck } from 'firebase/app-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getTokenMock = vi.hoisted(() => vi.fn());
vi.mock('firebase/app-check', () => ({ getToken: getTokenMock }));

// Imported after the mock so the module under test binds to the stubbed getToken.
const { ensureAppCheckToken, registerAppCheck } = await import('./app-check');

const INSTANCE = {} as AppCheck;

describe('ensureAppCheckToken', () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    registerAppCheck(undefined as unknown as AppCheck);
  });

  it('returns false without calling getToken when no instance was registered', async () => {
    await expect(ensureAppCheckToken()).resolves.toBe(false);
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it('returns true once a valid token is cached', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockResolvedValue({ token: 'abc' });
    await expect(ensureAppCheckToken()).resolves.toBe(true);
    expect(getTokenMock).toHaveBeenCalledWith(INSTANCE);
  });

  // A blocked reCAPTCHA script must not surface as a rejection: callers use this as a
  // best-effort pre-flight and proceed with the write either way.
  it('returns false instead of throwing when attestation rejects', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockRejectedValue(new Error('recaptcha blocked'));
    await expect(ensureAppCheckToken()).resolves.toBe(false);
  });

  // A hanging attestation must not stall the caller forever — that is what would leave
  // SessionService.startInFlight stuck true and kill session tracking for the whole tab.
  it('gives up after the timeout when attestation never settles', async () => {
    vi.useFakeTimers();
    registerAppCheck(INSTANCE);
    getTokenMock.mockReturnValue(new Promise(() => undefined));
    const pending = ensureAppCheckToken(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBe(false);
  });
});
