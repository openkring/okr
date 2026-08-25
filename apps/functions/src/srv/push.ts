// apps/functions/src/srv/push.ts
//
// Shared FCM delivery to a set of PERSONS (not devices, not uids).
//
// Extracted verbatim from `task/index.ts`, which was the only sender until the calendar
// grew its own (participant broadcast + comment/document activity, spec
// `2026-08-25-participant-messaging-spec.md` §2.3). Three things were duplicated there and
// are easy to get subtly wrong a second time: person → uid → token resolution, the
// data-only message shape the service worker depends on, and the removal of tokens Firebase
// reports as unregistered.
//
// ⚠️ THE BADGE IS AN ABSOLUTE VALUE, NOT AN INCREMENT. `badgeCount` overwrites whatever the
// app icon shows. Tasks and chat already write it; a third writer would clobber their number.
// So it is OPTIONAL here and omitted by every calendar sender — when the key is absent the
// service worker leaves the badge untouched (`firebase-messaging-sw.js:24`). Only pass it
// from a sender that knows the user's TOTAL pending count.

import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushPayload {
  /** Routing discriminator read by the service worker and the in-app handler. */
  type: string;
  title: string;
  body: string;
  /** In-app deep link the notification opens. */
  url: string;
  /**
   * Collapse key. The service worker passes it as the notification `tag`, so several pushes
   * with the same value REPLACE each other instead of stacking — five documents uploaded to
   * one event give one banner, not five.
   */
  channelId?: string;
  /** Absolute app-icon badge. Omit unless this sender knows the user's total (see file head). */
  badgeCount?: number;
}

/** One person's delivery target: a registered device token and where it is stored. */
interface TokenEntry {
  token: string;
  uid: string;
  docId: string;
}

/**
 * The `data` map of the message. Data-only is deliberate: with a `notification` field some
 * browsers display the message themselves and never call the service worker's
 * `onBackgroundMessage`, which is where the badge and the collapse tag are handled.
 *
 * Pure, so the two rules that matter are testable without Firebase: `badgeCount` appears
 * ONLY when the sender passed one, and `channelId` is carried through.
 */
export function buildPushData(payload: PushPayload): Record<string, string> {
  return {
    type: payload.type,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    ...(payload.channelId ? { channelId: payload.channelId } : {}),
    ...(payload.badgeCount === undefined ? {} : { badgeCount: String(payload.badgeCount) }),
  };
}

/** Every registered device of every person that has a user account. Persons without one drop out. */
async function collectTokens(personKeys: string[]): Promise<TokenEntry[]> {
  const db = getFirestore();
  const unique = [...new Set(personKeys.filter((key) => key.length > 0))];
  const entries: TokenEntry[] = [];

  await Promise.all(unique.map(async (personKey) => {
    const usersSnap = await db.collection('users').where('personKey', '==', personKey).limit(1).get();
    if (usersSnap.empty) return;                       // no account → no channel, not an error
    const uid = usersSnap.docs[0].id;
    const tokensSnap = await db.collection('users').doc(uid).collection('fcmTokens').get();
    for (const doc of tokensSnap.docs) {
      const token = doc.data()['token'] as string | undefined;
      if (token) entries.push({ token, uid, docId: doc.id });
    }
  }));

  return entries;
}

/**
 * Send one notification to every device of every given person.
 *
 * Never throws: a push is an extra, and a failed one must not fail the write that triggered
 * it. Returns the counts so the caller can log them in its own voice.
 *
 * @param personKeys the recipients — duplicates and empty keys are tolerated
 * @param payload    what to show (see PushPayload; mind the badge rule in the file head)
 * @param context    short label for the log line, e.g. 'notifyCalEventParticipants'
 */
export async function pushToPersons(
  personKeys: string[],
  payload: PushPayload,
  context: string,
): Promise<{ recipients: number; sent: number; failed: number }> {
  const entries = await collectTokens(personKeys);
  if (entries.length === 0) return { recipients: 0, sent: 0, failed: 0 };

  const data = buildPushData(payload);
  const response = await getMessaging().sendEachForMulticast({
    tokens: entries.map((entry) => entry.token),
    data,
    android: { priority: 'normal' },
    apns: {
      headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
      payload: {
        aps: {
          ...(payload.badgeCount === undefined ? {} : { badge: payload.badgeCount }),
          'content-available': 1,
        },
      },
    },
  });

  // A token Firebase reports as unregistered is dead for good — dropping it keeps the next
  // send from failing on the same device again.
  const db = getFirestore();
  const deletions: Promise<unknown>[] = [];
  response.responses.forEach((result, index) => {
    if (!result.success && result.error?.code === 'messaging/registration-token-not-registered') {
      const entry = entries[index];
      deletions.push(
        db.collection('users').doc(entry.uid).collection('fcmTokens').doc(entry.docId).delete()
          .catch((err) => logger.warn(`${context}: failed to delete stale token:`, err)),
      );
    }
  });
  await Promise.all(deletions);

  // Device count, never a person's identity — same rule as the outbox's send log.
  logger.info(`${context}: pushed to ${entries.length} device(s), sent=${response.successCount} failed=${response.failureCount}`);
  return { recipients: entries.length, sent: response.successCount, failed: response.failureCount };
}
