import { DEFAULT_DATETIME } from '@okr/shared-constants';

/**
 * The server badge ledger (spec 1.127 phase 3, §3.7 option B): one document per user at
 * `users/{uid}/badge/counts`. The app-icon badge is an ABSOLUTE value, and only a writer that
 * knows the full total may set it, so the total is kept here: the app writes the parts it knows
 * (`fromApp` becomes true), the push gateway adds chat events (de-duplicated by `seen`), the
 * invitation/task triggers recompute their part. A trigger on this doc sends a badge-only push
 * to the account's iOS tokens when the sum drops.
 *
 * Readable and writable by that uid only (firestore.rules); Cloud Functions use the admin SDK.
 * Mirrored by `ServerBadgeLedger` in `@okr/shared-util-core` (which must not import models).
 */
export class BadgeCountsModel {
  public chat = 0;
  public tasks = 0;
  public invitations = 0;
  public seen: string[] = []; // chat event ids already counted, newest last
  public fromApp = false; // true once the app wrote the parts; the sum is untrustworthy before
  public updatedAt = DEFAULT_DATETIME; // StoreDateTime of the last write
}

/** Subcollection name under `users/{uid}`. */
export const BadgeCollection = 'badge';

/** Document id of the single ledger document. */
export const BADGE_COUNTS_DOC_ID = 'counts';

/** Full path of a user's badge ledger document. */
export function badgeCountsPath(uid: string): string {
  return `users/${uid}/${BadgeCollection}/${BADGE_COUNTS_DOC_ID}`;
}
