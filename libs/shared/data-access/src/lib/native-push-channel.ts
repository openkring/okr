import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { NATIVE_PUSH_CHANNEL_ID } from '@okr/shared-constants';

/**
 * Create the Android notification channel every native push names (spec 1.10 Phase 1).
 *
 * - importance 4 (HIGH): FCM's fallback channel is DEFAULT, which puts pushes into the shade
 *   without a heads-up banner.
 * - visibility 0 (PRIVATE) states the intent only: Android ignores a lock-screen visibility set
 *   by an app on a channel (only the system and the notification ranker may set it; the channel
 *   keeps NO_OVERRIDE). What protects chat bodies on a locked phone is the per-NOTIFICATION
 *   visibility, which FCM sets to PRIVATE by default — the member's "hide sensitive content"
 *   setting then redacts it (verified on a POCO X3 Pro, 2026-10-14).
 *
 * Never throws: `createChannel` rejects below API 26 (minSdk is 24), where channels do not exist
 * and FCM shows pushes without one. Push registration must go on regardless.
 *
 * @return true when the channel was created (or already existed), false otherwise
 */
export async function ensureNativePushChannel(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false;
  try {
    await PushNotifications.createChannel({
      id: NATIVE_PUSH_CHANNEL_ID, name: 'Benachrichtigungen', importance: 4, visibility: 0,
    });
    return true;
  } catch (error) {
    console.warn('ensureNativePushChannel: channel not created, FCM default channel applies:', error);
    return false;
  }
}
