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
// ⚠️ A PERSON IS NOT AN ACCOUNT. Persons are shared across tenants, `users/{uid}` docs are
// single-tenant, so one person with accounts in two clubs has TWO user docs — and two sets of
// `fcmTokens`, one per installed app. Until 2026-09-15 this resolved person → user with
// `limit(1)`, i.e. whichever doc id happened to sort first; a member who joined a second club
// silently stopped receiving every push from the first one (SCS · Barbara). Every sender knows
// which tenant it speaks for, so the tenant is REQUIRED here and picks the account
// (`selectUserDocs`). A person with no account in that tenant gets nothing — never a foreign
// app's banner about an event they cannot open there.
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
  /**
   * The tenant this push speaks for. Selects the recipient's account (see file head), is
   * echoed in the data map so the service worker can refuse a foreign tenant's push, and
   * names the app in the title — one person, several clubs, several installed apps.
   */
  tenantId: string;
  /** Shown as `<app name> · <title>` — see `withAppName`. */
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
export interface TokenEntry {
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
    tenantId: payload.tenantId,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    ...(payload.channelId ? { channelId: payload.channelId } : {}),
    ...(payload.badgeCount === undefined ? {} : { badgeCount: String(payload.badgeCount) }),
  };
}

/** The slice of a `users/{uid}` doc the account selection needs. */
export interface UserAccount {
  uid: string;
  tenants?: string[];
  isArchived?: boolean;
}

/**
 * The accounts of one person that belong to `tenantId` — normally one, never a foreign one.
 *
 * No `limit(1)` and no fallback: a person without an account in the tenant has no app in
 * which the notification could be opened. Same rule `deliveryChannelsFor` in
 * `workflow/firestore-deps.ts` already applies to delivery preferences.
 */
export function selectUserDocs(accounts: UserAccount[], tenantId: string): UserAccount[] {
  return accounts.filter((account) => account.isArchived !== true && (account.tenants ?? []).includes(tenantId));
}

/**
 * `<app name> · <title>`, so the banner says which club it comes from before it is tapped.
 * Idempotent, so a sender that already prefixed does not get "SCS · SCS · …".
 */
export function withAppName(appName: string, title: string): string {
  const name = appName.trim();
  if (!name) return title;
  const prefix = `${name} · `;
  return title.startsWith(prefix) ? title : `${prefix}${title}`;
}

/** The tenant's display name from `app-config`, '' when unknown — never throws. */
export async function appNameFor(tenantId: string): Promise<string> {
  try {
    const snap = await getFirestore().collection('app-config').doc(tenantId).get();
    return String(snap.data()?.['appName'] ?? '');
  } catch {
    return '';
  }
}

/**
 * Every registered device of every given person's account IN THIS TENANT (see file head).
 * Persons without such an account drop out. Exported for `sendCallNotification`, which
 * builds its own message but must pick accounts by the same rule.
 */
export async function collectTokens(personKeys: string[], tenantId: string): Promise<TokenEntry[]> {
  const db = getFirestore();
  const unique = [...new Set(personKeys.filter((key) => key.length > 0))];
  const entries: TokenEntry[] = [];

  await Promise.all(unique.map(async (personKey) => {
    const usersSnap = await db.collection('users').where('personKey', '==', personKey).get();
    const accounts = usersSnap.docs.map((doc) => ({
      uid: doc.id,
      tenants: doc.data()['tenants'] as string[] | undefined,
      isArchived: doc.data()['isArchived'] as boolean | undefined,
    }));
    for (const account of selectUserDocs(accounts, tenantId)) {
      const tokensSnap = await db.collection('users').doc(account.uid).collection('fcmTokens').get();
      for (const doc of tokensSnap.docs) {
        const token = doc.data()['token'] as string | undefined;
        if (token) entries.push({ token, uid: account.uid, docId: doc.id });
      }
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
  const entries = await collectTokens(personKeys, payload.tenantId);
  if (entries.length === 0) return { recipients: 0, sent: 0, failed: 0 };

  const data = buildPushData({ ...payload, title: withAppName(await appNameFor(payload.tenantId), payload.title) });
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
