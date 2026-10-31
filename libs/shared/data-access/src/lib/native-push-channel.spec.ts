import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformMock = vi.hoisted(() => vi.fn(() => 'android'));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: platformMock } }));

const createChannelMock = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: { createChannel: createChannelMock } }));

const { ensureNativePushChannels } = await import('./native-push-channel');

const CHANNELS = [
  ['okr_chat', 'Chat'],
  ['okr_call', 'Videoanrufe'],
  ['okr_tasks', 'Aufgaben'],
  ['okr_events', 'Termine und Einladungen'],
  ['okr_default', 'Weitere'],
] as const;

describe('ensureNativePushChannels', () => {
  beforeEach(() => {
    createChannelMock.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); platformMock.mockReturnValue('android'); });

  it('creates one HIGH-importance channel per kind on Android', async () => {
    await expect(ensureNativePushChannels()).resolves.toBe(true);
    expect(createChannelMock).toHaveBeenCalledTimes(5);
    for (const [id, name] of CHANNELS) {
      expect(createChannelMock).toHaveBeenCalledWith({ id, name, importance: 4, visibility: 0 });
    }
  });

  // Chat bodies must not show on a locked phone; a channel's visibility cannot change once created.
  it('keeps the lock screen private on every channel', async () => {
    await ensureNativePushChannels();
    for (const call of createChannelMock.mock.calls) expect(call[0].visibility).toBe(0);
  });

  it('one rejection does not stop the others', async () => {
    createChannelMock.mockImplementation((c: { id: string }) =>
      c.id === 'okr_call' ? Promise.reject(new Error('boom')) : Promise.resolve());
    await expect(ensureNativePushChannels()).resolves.toBe(true);
    expect(createChannelMock).toHaveBeenCalledTimes(5);
  });

  // createChannel rejects below API 26 (minSdk is 24); that must not cost the device its push token.
  it('never throws and returns false when okr_default is not created', async () => {
    createChannelMock.mockRejectedValue(new Error('not available'));
    await expect(ensureNativePushChannels()).resolves.toBe(false);
  });

  it('does nothing on iOS or web', async () => {
    platformMock.mockReturnValue('ios');
    await expect(ensureNativePushChannels()).resolves.toBe(false);
    platformMock.mockReturnValue('web');
    await expect(ensureNativePushChannels()).resolves.toBe(false);
    expect(createChannelMock).not.toHaveBeenCalled();
  });
});
