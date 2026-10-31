// apps/functions/src/badge/on-badge-counts-written.ts
//
// B2 (spec 1.127 §3.7): when the server badge sum of an account DROPS, the other iOS devices
// of that account still show the old number. A badge-only APNs push (no alert, no sound, no
// data) lowers it. iOS tokens only: a silent push to a web token revokes the PWA push
// subscription, and native Android has no JS running for a data-only push.
//
// ⚠️ This trigger never writes the ledger (no loop).

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging, type TokenMessage } from 'firebase-admin/messaging';
import { BADGE_COUNTS_DOC_ID } from '@okr/shared-models';
import { badgeSumDropped, type PushTokenPlatform, type ServerBadgeLedger } from '@okr/shared-util-core';

const REGION = 'europe-west6';

/** FCM allows 500 messages per `sendEach`. */
const SEND_CHUNK = 500;

export interface BadgeTokenDoc {
  docId: string;
  token: string;
  platform?: PushTokenPlatform;
}

/** A push that only sets the app-icon badge: no `data`, no `notification`, no `android`. */
export function badgeOnlyMessage(token: string, badge: number): TokenMessage {
  return {
    token,
    apns: { headers: { 'apns-priority': '5', 'apns-push-type': 'alert' }, payload: { aps: { badge } } },
  };
}

/** Only tokens that are known to be iOS; a token without `platform` is unknown and dropped. */
export function iosTokensOf(docs: BadgeTokenDoc[]): BadgeTokenDoc[] {
  return docs.filter((d) => d.platform === 'ios' && !!d.token);
}

export const onBadgeCountsWritten = onDocumentWritten(
  // explicit cap (europe-west6 CPU quota is full, see init.ts)
  { document: 'users/{uid}/badge/{docId}', region: REGION, maxInstances: 5 },
  async (trigger) => {
    if (trigger.params.docId !== BADGE_COUNTS_DOC_ID) return;
    const before = trigger.data?.before?.exists ? (trigger.data.before.data() as Partial<ServerBadgeLedger>) : undefined;
    const after = trigger.data?.after?.exists ? (trigger.data.after.data() as Partial<ServerBadgeLedger>) : undefined;
    const badge = badgeSumDropped(before, after);
    if (badge === undefined) return;

    const db = getFirestore();
    const tokensRef = db.collection('users').doc(trigger.params.uid).collection('fcmTokens');
    const snap = await tokensRef.get();
    const devices = iosTokensOf(
      snap.docs.map((d) => {
        const data = d.data() as { token?: string; platform?: PushTokenPlatform };
        return { docId: d.id, token: data.token ?? '', platform: data.platform };
      }),
    );
    if (devices.length === 0) return;

    const deletions: Promise<unknown>[] = [];
    let sent = 0;
    let failed = 0;
    for (let start = 0; start < devices.length; start += SEND_CHUNK) {
      const chunk = devices.slice(start, start + SEND_CHUNK);
      let response;
      try {
        response = await getMessaging().sendEach(chunk.map((d) => badgeOnlyMessage(d.token, badge)));
      } catch (err) {
        logger.warn(`onBadgeCountsWritten: sendEach failed for a chunk of ${chunk.length} devices:`, err);
        failed += chunk.length;
        continue;
      }
      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((result, index) => {
        if (!result.success && result.error?.code === 'messaging/registration-token-not-registered') {
          deletions.push(
            tokensRef.doc(chunk[index].docId).delete()
              .catch((err) => logger.warn('onBadgeCountsWritten: failed to delete stale token:', err)),
          );
        }
      });
    }
    await Promise.all(deletions);
    // Device count only, never a uid or a token.
    logger.info(`onBadgeCountsWritten: badge-only push to ${devices.length} iOS device(s), sent=${sent} failed=${failed}`);
  },
);
