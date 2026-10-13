import { CustomProvider, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.hoisted(() => vi.fn(() => false));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: isNativeMock } }));

const initializeMock = vi.hoisted(() => vi.fn());
const nativeGetTokenMock = vi.hoisted(() => vi.fn());
vi.mock('@capacitor-firebase/app-check', () => ({
  FirebaseAppCheck: { initialize: initializeMock, getToken: nativeGetTokenMock },
}));

// Imported after the mocks so the module under test binds to the stubs.
const { chooseAppCheckProvider, getNativeAppCheckToken, requestNativeAppCheckRefresh, resetNativeAppCheckForTests } =
  await import('./app-check-provider');

const OPTIONS = { recaptchaEnterpriseKey: 'site-key', debugToken: 'fixed-debug-token' };

describe('chooseAppCheckProvider', () => {
  afterEach(() => isNativeMock.mockReturnValue(false));

  it('web production: reCAPTCHA Enterprise, no debug token', () => {
    const choice = chooseAppCheckProvider({ ...OPTIONS, production: true });
    expect(choice.platform).toBe('web');
    expect(choice.provider).toBeInstanceOf(ReCaptchaEnterpriseProvider);
    expect(choice.webDebugToken).toBeUndefined();
  });

  it('web dev: keeps the fixed debug token from the environment', () => {
    const choice = chooseAppCheckProvider({ ...OPTIONS, production: false });
    expect(choice.provider).toBeInstanceOf(ReCaptchaEnterpriseProvider);
    expect(choice.webDebugToken).toBe('fixed-debug-token');
  });

  it('web dev without a fixed token falls back to true (print-and-register flow)', () => {
    const choice = chooseAppCheckProvider({ recaptchaEnterpriseKey: 'site-key', production: false });
    expect(choice.webDebugToken).toBe(true);
  });

  // A JS debug token makes the SDK skip the provider, so native attestation would never run.
  it('native dev → no web debug token, custom provider', () => {
    isNativeMock.mockReturnValue(true);
    const choice = chooseAppCheckProvider({ ...OPTIONS, production: false });
    expect(choice.platform).toBe('native');
    expect(choice.provider).toBeInstanceOf(CustomProvider);
    expect(choice.webDebugToken).toBeUndefined();
  });

  it('native production → custom provider, no web debug token', () => {
    isNativeMock.mockReturnValue(true);
    const choice = chooseAppCheckProvider({ ...OPTIONS, production: true });
    expect(choice.provider).toBeInstanceOf(CustomProvider);
    expect(choice.webDebugToken).toBeUndefined();
  });
});

describe('getNativeAppCheckToken', () => {
  beforeEach(() => {
    resetNativeAppCheckForTests();
    initializeMock.mockReset().mockResolvedValue(undefined);
    nativeGetTokenMock.mockReset().mockResolvedValue({ token: 'jwt', expireTimeMillis: 1_000 });
  });

  afterEach(() => vi.useRealTimers());

  it('initializes once, even for concurrent first calls', async () => {
    await Promise.all([getNativeAppCheckToken(true), getNativeAppCheckToken(true)]);
    await getNativeAppCheckToken(true);
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(initializeMock).toHaveBeenCalledWith({ debugToken: true, isTokenAutoRefreshEnabled: true });
    expect(nativeGetTokenMock).toHaveBeenCalledTimes(3);
  });

  it('passes the native expiry through', async () => {
    await expect(getNativeAppCheckToken(false)).resolves.toEqual({ token: 'jwt', expireTimeMillis: 1_000 });
    expect(initializeMock).toHaveBeenCalledWith({ debugToken: false, isTokenAutoRefreshEnabled: true });
  });

  it('missing expiry → now + 30 minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    nativeGetTokenMock.mockResolvedValue({ token: 'jwt' });
    const result = await getNativeAppCheckToken(true);
    expect(result.expireTimeMillis).toBe(Date.parse('2026-10-12T10:30:00Z'));
  });

  // The JS SDK calls the provider without a force flag; a denial recovery requests one out of band.
  it('a requested refresh forces only the next native token request', async () => {
    requestNativeAppCheckRefresh();
    await getNativeAppCheckToken(true);
    await getNativeAppCheckToken(true);
    expect(nativeGetTokenMock).toHaveBeenNthCalledWith(1, { forceRefresh: true });
    expect(nativeGetTokenMock).toHaveBeenNthCalledWith(2, { forceRefresh: false });
  });

  it('initialize failure is retried on the next call', async () => {
    initializeMock.mockRejectedValueOnce(new Error('no google-services.json'));
    await expect(getNativeAppCheckToken(true)).rejects.toThrow('no google-services.json');
    await expect(getNativeAppCheckToken(true)).resolves.toEqual({ token: 'jwt', expireTimeMillis: 1_000 });
    expect(initializeMock).toHaveBeenCalledTimes(2);
  });
});
