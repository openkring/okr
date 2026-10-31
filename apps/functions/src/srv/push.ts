// apps/functions/src/srv/push.ts
//
// Shared FCM delivery to a set of PERSONS (not devices, not uids).
//
// Extracted verbatim from `task/index.ts`, which was the only sender until the calendar
// grew its own (invitation + comment/document activity, spec
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
// ⚠️ NO SENDER KNOWS THE BADGE TOTAL (chat over this tenant's rooms + open tasks + open
// invitations), and `setAppBadge` is absolute. Two paths, two rules:
//
// - WEB (the `data` map): a push names only ITS part (spec 1.93) — `badgeTasks` (absolute
//   open-task count) or `badgeAdd` + `badgeId` (one new item, de-duplicated by id). The service
//   worker keeps the other parts in its device ledger and shows the sum. Never a total in the
//   data — the old `badgeCount` clobbered the parts it did not know.
// - NATIVE (`aps.badge`, Android `notificationCount`): the server ledger sum
//   `users/{uid}/badge/counts` (spec 1.127 §3.7 B1), per account and read AFTER the sender
//   updated its own part. The open app writes all parts (`fromApp`); until it has, the sum is
//   unknown and the badge is left out of the message (never a guess).

import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging, type AndroidConfig, type ApnsConfig, type TokenMessage } from 'firebase-admin/messaging';
import { NATIVE_PUSH_CHANNEL_ID, type NativePushChannelId } from '@okr/shared-constants';
import type { PushTokenPlatform } from '@okr/shared-util-core';
import { readBadgeSums } from '../badge/ledger';

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
  /** The recipient's absolute open-task count — the task part of the badge (see file head). */
  badgeTasks?: number;
  /** One new badge item of this kind; `badgeId` de-duplicates repeated deliveries. */
  badgeAdd?: 'invitation';
  badgeId?: string;
}

/** One person's delivery target: a registered device token and where it is stored. */
export interface TokenEntry {
  token: string;
  uid: string;
  docId: string;
  /** Written by new builds only; old token docs have none and count as unknown. */
  platform?: PushTokenPlatform;
}

const PLATFORMS: readonly string[] = ['ios', 'android', 'web'];

/** FCM allows 500 messages per `sendEach`. */
const SEND_CHUNK = 500;

/**
 * The native Android channel for a push `type` (the discriminator the senders pass). Anything
 * unlisted — file transfers, track requests — stays on the catch-all `okr_default`.
 */
export function nativeChannelFor(type: string): NativePushChannelId {
  switch (type) {
    case 'chat': return 'okr_chat';
    case 'video-call': return 'okr_call';
    case 'task': return 'okr_tasks';
    case 'calevent': return 'okr_events';
    default: return NATIVE_PUSH_CHANNEL_ID;
  }
}

/**
 * The `data` map of the message. Data-only is deliberate: with a `notification` field some
 * browsers display the message themselves and never call the service worker's
 * `onBackgroundMessage`, which is where the badge and the collapse tag are handled.
 *
 * Pure, so the rules that matter are testable without Firebase: the badge fields appear ONLY
 * when the sender passed them, and `channelId` is carried through.
 */
export function buildPushData(payload: PushPayload): Record<string, string> {
  return {
    type: payload.type,
    tenantId: payload.tenantId,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    ...(payload.channelId ? { channelId: payload.channelId } : {}),
    ...(payload.badgeTasks === undefined ? {} : { badgeTasks: String(payload.badgeTasks) }),
    ...(payload.badgeAdd && payload.badgeId ? { badgeAdd: payload.badgeAdd, badgeId: payload.badgeId } : {}),
  };
}

/** The slice of a `users/{uid}` doc the account selection needs. */
export interface UserAccount {
  uid: string;
  tenants?: string[];
  isArchived?: boolean;
  roles?: Record<string, boolean>;
}

/**
 * The `android` block of a push. The data-only shape above exists for the WEB service worker,
 * which builds the notification itself; the native Android app (Capacitor) has no service
 * worker and shows NOTHING for a data-only message (spec 1.10 Phase 1). FCM applies this block
 * only to native Android app instances, so web tokens — including Chrome on Android — still
 * receive the plain data message. `tag` collapses pushes about the same thing into one banner.
 */
/**
 * The `apns` block of a push for the native iOS app. iOS shows NOTHING for a background push
 * (`apns-push-type: background` + `content-available`), so every sender needs a visible alert —
 * TestFlight build 4 showed a banner and the icon badge only for this shape (spec 1.10 Phase 3).
 * FCM applies `apns` only to native iOS instances; web push (incl. Safari) is untouched. No
 * `content-available` next to an alert: Apple leaves that combination undefined.
 *
 * @param badge the absolute badge value, only when the sender knows it (see the file head)
 */
export function appleDisplay(title: string, body: string, badge?: number): ApnsConfig {
  return {
    headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
    payload: { aps: { alert: { title, body }, sound: 'default', ...(badge === undefined ? {} : { badge }) } },
  };
}

export function androidDisplay(
  title: string,
  body: string,
  priority: 'high' | 'normal',
  tag?: string,
  channelId: string = NATIVE_PUSH_CHANNEL_ID,
  badge?: number,
): AndroidConfig {
  return {
    priority,
    notification: { title, body, channelId, ...(tag ? { tag } : {}), ...(badge === undefined ? {} : { notificationCount: badge }) },
  };
}

/**
 * One device's message: the shared data map plus the native blocks. A per-kind channel goes only
 * to `platform: 'android'` tokens — only builds that write `platform` also create the channels;
 * an older build would get a channel it never made and Android would drop the banner. The badge
 * is the server ledger sum, left out entirely while unknown (never a guess).
 */
export function buildTokenMessage(
  entry: TokenEntry,
  data: Record<string, string>,
  badge: number | undefined,
  kind: { priority: 'high' | 'normal'; tag?: string },
): TokenMessage {
  const channelId = entry.platform === 'android' ? nativeChannelFor(data['type']) : NATIVE_PUSH_CHANNEL_ID;
  return {
    token: entry.token,
    data,
    android: androidDisplay(data['title'], data['body'], kind.priority, kind.tag, channelId, badge),
    apns: appleDisplay(data['title'], data['body'], badge),
  };
}

/**
 * The badge part an account gets: the count only with the role `registered` (spec 1.127 M5) —
 * the dashboard cards need it, and the badge must not count what they hide (same gate as
 * `AppStore.openTaskCount` / `openInvitationCount`).
 */
export function badgePartFor(account: UserAccount, count: number): number {
  return account.roles?.['registered'] === true ? count : 0;
}

/** A token doc's `platform`, `undefined` for a missing or unknown value (older builds). */
export function platformOf(raw: unknown): PushTokenPlatform | undefined {
  return typeof raw === 'string' && PLATFORMS.includes(raw) ? (raw as PushTokenPlatform) : undefined;
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
 * The accounts of the given persons IN THIS TENANT (see file head, `selectUserDocs`), with their
 * roles — the badge ledger writers need the uid and the `registered` gate (`badgePartFor`).
 */
export async function accountsInTenant(personKeys: string[], tenantId: string): Promise<UserAccount[]> {
  const db = getFirestore();
  const unique = [...new Set(personKeys.filter((key) => key.length > 0))];
  const perPerson = await Promise.all(unique.map(async (personKey) => {
    const usersSnap = await db.collection('users').where('personKey', '==', personKey).get();
    return selectUserDocs(usersSnap.docs.map((doc) => ({
      uid: doc.id,
      tenants: doc.data()['tenants'] as string[] | undefined,
      isArchived: doc.data()['isArchived'] as boolean | undefined,
      roles: doc.data()['roles'] as Record<string, boolean> | undefined,
    })), tenantId);
  }));
  return perPerson.flat();
}

/**
 * Every registered device of every given person's account IN THIS TENANT (see file head).
 * Persons without such an account drop out. Exported for `sendCallNotification`, which
 * builds its own message but must pick accounts by the same rule.
 */
export async function collectTokens(personKeys: string[], tenantId: string): Promise<TokenEntry[]> {
  const db = getFirestore();
  const entries: TokenEntry[] = [];
  const accounts = await accountsInTenant(personKeys, tenantId);

  await Promise.all(accounts.map(async (account) => {
    const tokensSnap = await db.collection('users').doc(account.uid).collection('fcmTokens').get();
    for (const doc of tokensSnap.docs) {
      const token = doc.data()['token'] as string | undefined;
      const platform = platformOf(doc.data()['platform']);
      if (token) {
        entries.push({ token, uid: account.uid, docId: doc.id, ...(platform ? { platform } : {}) });
      }
    }
  }));

  return entries;
}

/**
 * `readBadgeSums`, but a failed read only costs the badge (logged), never the push.
 * Exported for `sendCallNotification`.
 */
export async function readBadgeSumsOrNone(uids: string[], context: string): Promise<Map<string, number | undefined>> {
  try {
    return await readBadgeSums(uids);
  } catch (err) {
    logger.warn(`${context}: badge ledger read failed, sending without badge:`, err);
    return new Map<string, number | undefined>();
  }
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
  // The badge per account from the server ledger; unknown (old builds) stays out of the message.
  const sums = await readBadgeSumsOrNone(entries.map((entry) => entry.uid), context);
  const messages = entries.map((entry) => buildTokenMessage(entry, data, sums.get(entry.uid), { priority: 'normal', tag: data['channelId'] }));

  let successCount = 0;
  let failureCount = 0;
  // A token Firebase reports as unregistered is dead for good — dropping it keeps the next
  // send from failing on the same device again. The index maps back into the chunk's entries.
  const db = getFirestore();
  const deletions: Promise<unknown>[] = [];
  for (let start = 0; start < messages.length; start += SEND_CHUNK) {
    const chunkEntries = entries.slice(start, start + SEND_CHUNK);
    const response = await getMessaging().sendEach(messages.slice(start, start + SEND_CHUNK));
    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((result, index) => {
      if (!result.success && result.error?.code === 'messaging/registration-token-not-registered') {
        const entry = chunkEntries[index];
        deletions.push(
          db.collection('users').doc(entry.uid).collection('fcmTokens').doc(entry.docId).delete()
            .catch((err) => logger.warn(`${context}: failed to delete stale token:`, err)),
        );
      }
    });
  }
  await Promise.all(deletions);

  // Device count, never a person's identity — same rule as the outbox's send log.
  logger.info(`${context}: pushed to ${entries.length} device(s), sent=${successCount} failed=${failureCount}`);
  return { recipients: entries.length, sent: successCount, failed: failureCount };
}
