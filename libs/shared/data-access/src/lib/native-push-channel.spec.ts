import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformMock = vi.hoisted(() => vi.fn(() => 'android'));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: platformMock } }));

const createChannelMock = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: { createChannel: createChannelMock } }));

const { ensureNativePushChannel } = await import('./native-push-channel');

describe('ensureNativePushChannel', () => {
  beforeEach(() => {
    createChannelMock.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); platformMock.mockReturnValue('android'); });

  it('creates the HIGH-importance channel on Android', async () => {
    await expect(ensureNativePushChannel()).resolves.toBe(true);
    expect(createChannelMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'okr_default', importance: 4 }));
  });

  // Chat bodies must not show on a locked phone; a channel's visibility cannot change once created.
  it('keeps the lock screen private', async () => {
    await ensureNativePushChannel();
    expect(createChannelMock.mock.calls[0][0].visibility).toBe(0);
  });

  // createChannel rejects below API 26 (minSdk is 24); that must not cost the device its push token.
  it('never throws when the platform has no channels', async () => {
    createChannelMock.mockRejectedValue(new Error('not available'));
    await expect(ensureNativePushChannel()).resolves.toBe(false);
  });

  it('does nothing on iOS or web', async () => {
    platformMock.mockReturnValue('ios');
    await expect(ensureNativePushChannel()).resolves.toBe(false);
    platformMock.mockReturnValue('web');
    await expect(ensureNativePushChannel()).resolves.toBe(false);
    expect(createChannelMock).not.toHaveBeenCalled();
  });
});
