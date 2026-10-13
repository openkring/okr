import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.hoisted(() => vi.fn(() => false));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: isNativeMock } }));

const { unregisterServiceWorkersOnNative } = await import('./platform.util');

function stubRegistrations(count: number) {
  const unregister = vi.fn().mockResolvedValue(true);
  const regs = Array.from({ length: count }, () => ({ unregister }));
  vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistrations: vi.fn().mockResolvedValue(regs) } });
  return unregister;
}

describe('unregisterServiceWorkersOnNative', () => {
  afterEach(() => { vi.unstubAllGlobals(); isNativeMock.mockReturnValue(false); });

  // A Phase 0 test install still has ngsw registered; disabling registration alone leaves it in control.
  it('unregisters existing workers on native', async () => {
    isNativeMock.mockReturnValue(true);
    const unregister = stubRegistrations(2);
    await expect(unregisterServiceWorkersOnNative()).resolves.toBe(2);
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it('leaves web registrations alone', async () => {
    const unregister = stubRegistrations(1);
    await expect(unregisterServiceWorkersOnNative()).resolves.toBe(0);
    expect(unregister).not.toHaveBeenCalled();
  });

  it('is a no-op without service worker support', async () => {
    isNativeMock.mockReturnValue(true);
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: undefined });
    await expect(unregisterServiceWorkersOnNative()).resolves.toBe(0);
  });
});
