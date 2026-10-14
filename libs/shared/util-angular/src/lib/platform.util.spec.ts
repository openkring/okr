import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.hoisted(() => vi.fn(() => false));
const platformMock = vi.hoisted(() => vi.fn(() => 'web'));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: isNativeMock, getPlatform: platformMock } }));

const { ensureNativeMapTransparency, unregisterServiceWorkersOnNative } = await import('./platform.util');

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

// On Android the native map is drawn BENEATH the WebView; every ancestor of the map element must be
// transparent or the map shows white (@capacitor/google-maps README). Web and iOS need nothing.
describe('ensureNativeMapTransparency', () => {
  const styleEl = () => document.getElementById('okr-native-map-transparency');
  afterEach(() => { styleEl()?.remove(); platformMock.mockReturnValue('web'); });

  it('adds one global style on Android that clears the backgrounds above a map', () => {
    platformMock.mockReturnValue('android');
    ensureNativeMapTransparency();
    const css = styleEl()?.textContent ?? '';
    expect(css).toContain(':has(capacitor-google-map)');
    expect(css).toContain('--background: transparent');
  });

  it('adds it only once, however many maps are created', () => {
    platformMock.mockReturnValue('android');
    ensureNativeMapTransparency();
    ensureNativeMapTransparency();
    expect(document.querySelectorAll('#okr-native-map-transparency')).toHaveLength(1);
  });

  it('does nothing on web or iOS', () => {
    ensureNativeMapTransparency();
    platformMock.mockReturnValue('ios');
    ensureNativeMapTransparency();
    expect(styleEl()).toBeNull();
  });
});
