/**
 * Firestore doc id of an FCM token under users/{uid}/fcmTokens: its first 128 characters
 * (web tokens are ~163 chars; they are URL-safe, so the prefix is a valid, stable id).
 * Save and delete must both derive the id here, otherwise a delete by full token never matches.
 */
export function fcmTokenDocId(token: string): string {
  return token.substring(0, 128);
}

/**
 * Platform of a token doc under users/{uid}/fcmTokens (`platform`, spec 1.127 phase 3), written by
 * every save. Docs written by older builds have none: treat a missing value as unknown.
 */
export type PushTokenPlatform = 'ios' | 'android' | 'web';
