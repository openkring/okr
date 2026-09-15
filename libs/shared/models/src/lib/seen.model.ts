import { DEFAULT_DATETIME, DEFAULT_KEY } from '@okr/shared-constants';

/**
 * "I have looked at this": one document per user and per parent, stored under
 * `users/{uid}/seen/{parentKey}` — a subcollection like `fcmTokens`, readable and writable by
 * that uid only (firestore.rules). The doc id IS the parent key (`calevent.<okey>`), so a
 * lookup is a map access and re-opening the same event overwrites the same document.
 *
 * `count` is the parent's `activityCount` at the moment of viewing; the unseen badge is the
 * parent's current count minus this. A counter, not a timestamp, so the client never has to
 * load the comments themselves to know how many are new.
 */
export class SeenModel {
  public okey = DEFAULT_KEY; // parentKey: '<modelType>.<key>', e.g. 'calevent.abc123'
  public count = 0;
  public seenAt = DEFAULT_DATETIME; // StoreDateTime of the last view
}

/** Subcollection name under `users/{uid}`. */
export const SeenCollection = 'seen';

/** Full path of a user's seen markers. */
export function seenCollectionPath(uid: string): string {
  return `users/${uid}/${SeenCollection}`;
}
