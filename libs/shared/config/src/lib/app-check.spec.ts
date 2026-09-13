import type { AppCheck } from 'firebase/app-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getTokenMock = vi.hoisted(() => vi.fn());
vi.mock('firebase/app-check', () => ({ getToken: getTokenMock }));

// Imported after the mock so the module under test binds to the stubbed getToken.
const { attestAppCheck, ensureAppCheckToken, isAttested, registerAppCheck } = await import('./app-check');

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
    expect(getTokenMock).toHaveBeenCalledWith(INSTANCE, false);   // cached token is fine
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

  // A cached token that the backend rejects (PERMISSION_DENIED on a rule-satisfying write, SCS-8N)
  // is valid by the client's clock, so only a forced attestation replaces it.
  it('attests anew when forceRefresh is set', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockResolvedValue({ token: 'abc' });
    await expect(ensureAppCheckToken(undefined, true)).resolves.toBe(true);
    expect(getTokenMock).toHaveBeenCalledWith(INSTANCE, true);
  });

  // A denial incident kills EVERY open listener at once and each one's recovery calls in here.
  // Fanning that out into one reCAPTCHA round trip per listener is what reCAPTCHA throttles.
  it('coalesces concurrent forced attestations into a single round trip', async () => {
    registerAppCheck(INSTANCE);
    let settle: (value: unknown) => void = () => undefined;
    getTokenMock.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    const both = Promise.all([
      ensureAppCheckToken(undefined, true),
      ensureAppCheckToken(undefined, true),
    ]);
    settle({ token: 'abc' });

    await expect(both).resolves.toEqual([true, true]);
    expect(getTokenMock).toHaveBeenCalledTimes(1);
  });

  // The denials of one incident trickle in over a second or two, so they never share an in-flight
  // promise. A token minted moments ago is already the freshest answer available.
  it('answers a forced call from the cooldown when one just succeeded', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockResolvedValue({ token: 'abc' });

    await expect(ensureAppCheckToken(undefined, true)).resolves.toBe(true);
    await expect(ensureAppCheckToken(undefined, true)).resolves.toBe(true);
    expect(getTokenMock).toHaveBeenCalledTimes(1);
  });

  // A blocked or timed-out attestation must stay retryable — caching a failure would turn a
  // transient reCAPTCHA hiccup into ten seconds of guaranteed denials.
  it('does not enter the cooldown when the forced attestation failed', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockRejectedValueOnce(new Error('recaptcha blocked'));
    getTokenMock.mockResolvedValue({ token: 'abc' });

    await expect(ensureAppCheckToken(undefined, true)).resolves.toBe(false);
    await expect(ensureAppCheckToken(undefined, true)).resolves.toBe(true);
    expect(getTokenMock).toHaveBeenCalledTimes(2);
  });
});

// The boolean above collapses five very different outcomes into one bit, and the write path
// reports that bit to Sentry as the diagnosis of a PERMISSION_DENIED. `cooldown` in particular
// used to read as `refreshed` — "the backend rejected a freshly minted token", i.e. a rules
// defect — when in truth this call had attested nothing at all (KWA-4).
describe('attestAppCheck', () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    registerAppCheck(undefined as unknown as AppCheck);
  });

  it('reports unregistered when registerAppCheck was never called', async () => {
    await expect(attestAppCheck()).resolves.toBe('unregistered');
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it('reports cached for the non-forced path', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockResolvedValue({ token: 'abc' });
    await expect(attestAppCheck()).resolves.toBe('cached');
  });

  it('reports refreshed when a forced round trip actually minted a token', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockResolvedValue({ token: 'abc' });
    await expect(attestAppCheck(undefined, true)).resolves.toBe('refreshed');
  });

  // The case the old boolean mislabelled: usable token, but nothing was attested HERE.
  it('reports cooldown, not refreshed, when answered from a just-succeeded refresh', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockResolvedValue({ token: 'abc' });

    await expect(attestAppCheck(undefined, true)).resolves.toBe('refreshed');
    await expect(attestAppCheck(undefined, true)).resolves.toBe('cooldown');
    expect(getTokenMock).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when attestation is blocked', async () => {
    registerAppCheck(INSTANCE);
    getTokenMock.mockRejectedValue(new Error('recaptcha blocked'));
    await expect(attestAppCheck(undefined, true)).resolves.toBe('unavailable');
  });

  // `ensureAppCheckToken` is now a projection of these outcomes and must keep its old contract:
  // every outcome that leaves a usable token in the SDK cache is still `true`.
  it('maps outcomes back onto the boolean contract', () => {
    expect(isAttested('refreshed')).toBe(true);
    expect(isAttested('cached')).toBe(true);
    expect(isAttested('cooldown')).toBe(true);
    expect(isAttested('unavailable')).toBe(false);
    expect(isAttested('unregistered')).toBe(false);
  });
});
