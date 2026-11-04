// apps/functions/src/matrix-simple/chat-email.ts
//
// Chat messages by email (TOC 1.139). `setChatEmailDelivery` switches a room, `sendChatEmailDigests`
// mails what is new every 15 minutes through the workflow outbox. Both are off for a room until
// someone switches it on; `chat-email-rooms/{roomId}` keeps the job from scanning every room.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DateFormat, getTodayStr, isKioskOnly } from '@okr/shared-util-core';

import { chatDigestEmail } from '../calendar/mail';
import { brandOf, tenantLinks } from '../calendar/deliver';
import { selectUserDocs } from '../srv/push';
import { createFirestoreDeps } from '../workflow/firestore-deps';
import { OutboxDoc, WorkflowOutboxCollection } from '../workflow/outbox';
import { groupKeyOfRoomAlias, groupOfRoom, pinKindOfGroup } from './chat-pins';
import {
  capMessages, CHAT_EMAIL_GRACE_MS, ChatEmailRoomsCollection, digestMessages, digestOutboxId, emailDeliveryNotice,
  EmailDeliveryRoomKind, mayChangeEmailDelivery, messagesForMember, OKR_EMAIL_DELIVERY_EVENT, readUpTo, RoomEvent, wantsEmail,
} from './chat-email.logic';
import { fetchBotUserId } from './notes-room';
import { hasGroupChatPage } from './push';
import {
  chatDeepLink, checkRateLimit, ensureAdminInRoom, getCallerRoles, getJoinedMemberIds, getRoomSummary, getRoomTenantMarker,
  getUserGlobalAccountData, groupKeyFromRoomAlias, MATRIX_HOMESERVER, matrixAdminToken, muteBlocksPush, OKR_MUTE_EVENT,
  putRoomStateContent, requireParam, requireProvisionedUser, requireRoomInTenant, requireUserPersonKey, resolvePersonDisplayName,
  sendBotNotice, serverHostname,
} from './shared';

const REGION = 'europe-west6';
const CF_NAME = 'setChatEmailDelivery';
const JOB_NAME = 'sendChatEmailDigests';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

interface ChatEmailRoomDoc {
  tenants: string[];
  enabled: boolean;
  /** ms: every message up to here is dealt with. */
  cursor: number;
}

/** Whether the room is encrypted; throws when unreadable, so nothing is switched on a guess. */
async function roomIsEncrypted(roomId: string, token: string): Promise<boolean> {
  const resp = await fetch(`${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`roomIsEncrypted ${roomId} → ${resp.status}`);
  return !!((await resp.json()) as { encryption?: string | null }).encryption;
}

/** The persons of the tenants by Matrix localpart: Matrix ids are lowercased, Firestore keys are not. */
async function personKeysByLocalpart(db: Firestore, tenants: string[]): Promise<Map<string, string>> {
  const snaps = await Promise.all(tenants.map((t) => db.collection('persons').where('tenants', 'array-contains', t).select().get()));
  return new Map(snaps.flatMap((s) => s.docs.map((d) => [d.id.toLowerCase(), d.id] as [string, string])));
}

const localpartOf = (matrixUserId: string): string => matrixUserId.slice(1).split(':')[0];

/** A direct chat has no group and no alias, and exactly two people in it (the bot does not count). */
function emailDeliveryKindOf(
  group: Record<string, unknown> | undefined, canonicalAlias: string | undefined, humans: string[],
): EmailDeliveryRoomKind {
  if (group) return pinKindOfGroup(group['kind']);
  return !canonicalAlias && humans.length === 2 ? 'direct' : 'other';
}

/**
 * Switch email delivery of a room (spec 1.139 §3). Members lack the power level for the state
 * event, so the bot writes it. Refused: unmarked rooms (the job would skip them anyway), encrypted
 * rooms, kiosk chats, and whoever §3 does not name. On a direct chat this joins the bot, which
 * otherwise stays out of DMs: the state event and the notice need it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleSetChatEmailDelivery(request: CallableRequest<any>): Promise<{ enabled: boolean }> {
  const uid = await requireProvisionedUser(request, CF_NAME);
  checkRateLimit(uid, CF_NAME, 10);
  const { roomId, enabled } = request.data as { roomId?: string; enabled?: boolean };
  const room = requireParam(roomId, 'roomId', 255);
  if (typeof enabled !== 'boolean') throw new HttpsError('invalid-argument', 'enabled must be true or false');

  const token = matrixAdminToken.value();
  await requireRoomInTenant(room, uid, CF_NAME, token);

  const personKey = await requireUserPersonKey(uid, CF_NAME);
  const callerMatrixId = `@${personKey.toLowerCase()}:${serverHostname()}`;
  const db = getFirestore();
  let members: Set<string>;
  let botUserId: string;
  let tenants: string[] | undefined;
  try {
    [members, botUserId, tenants] = await Promise.all([getJoinedMemberIds(room, token), fetchBotUserId(token), getRoomTenantMarker(room, token, { strict: true })]);
  } catch (e) {
    console.error(`${CF_NAME}: reading the room failed`, e);
    throw new HttpsError('unavailable', 'The room could not be read.');
  }
  if (!members.has(callerMatrixId)) throw new HttpsError('permission-denied', 'Only members of the room may change this.');
  if (!tenants?.length) throw new HttpsError('failed-precondition', 'The room belongs to no tenant.');

  const summary = await getRoomSummary(room, token);
  const group = await groupOfRoom(room, token);
  const humans = [...members].filter((m) => m !== botUserId);
  const kind = emailDeliveryKindOf(group, summary?.canonicalAlias, humans);
  const isGroupAdmin = Array.isArray(group?.['admins']) && (group['admins'] as { key?: string }[]).some((a) => a?.key === personKey);
  if (!mayChangeEmailDelivery(kind, await getCallerRoles(uid), isGroupAdmin)) {
    throw new HttpsError('permission-denied', 'You may not change email delivery of this room.');
  }
  if (kind === 'direct' && await hasKioskMember(db, humans, tenants)) {
    throw new HttpsError('failed-precondition', 'A kiosk chat cannot be delivered by email.');
  }
  if (enabled && await roomIsEncrypted(room, token)) {
    throw new HttpsError('failed-precondition', 'An encrypted room cannot be delivered by email.');
  }

  try {
    await ensureAdminInRoom(room, token);
    await putRoomStateContent(room, OKR_EMAIL_DELIVERY_EVENT, enabled ? { enabled: true } : {}, token);
    const ref = db.collection(ChatEmailRoomsCollection).doc(room);
    // Switching on starts at now: what was written before stays in the chat.
    await ref.set(enabled ? { tenants, enabled, cursor: Date.now() } : { enabled, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await sendBotNotice(room, emailDeliveryNotice(enabled), `email_delivery_${enabled}_${Date.now()}`, token);
  } catch (e) {
    console.error(`${CF_NAME}: switching failed`, e);
    throw new HttpsError('internal', 'Email delivery could not be changed.');
  }
  console.log(`${CF_NAME}: ${room} → ${enabled} by ${personKey}`);
  return { enabled };
}

async function hasKioskMember(db: Firestore, humans: string[], tenants: string[]): Promise<boolean> {
  const keys = await personKeysByLocalpart(db, tenants);
  for (const m of humans) {
    const key = keys.get(localpartOf(m));
    if (!key) continue;
    const users = await db.collection('users').where('personKey', '==', key).get();
    if (users.docs.some((d) => isKioskOnly(d.data() as never))) return true;
  }
  return false;
}

/** All events since `sinceTs`, newest pages first; bounded, a run is never meant to read a whole room. */
async function readRoomEvents(roomId: string, sinceTs: number, token: string): Promise<RoomEvent[]> {
  const events: RoomEvent[] = [];
  let from: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), dir: 'b' });
    if (from) params.set('from', from);
    const resp = await fetch(`${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`readRoomEvents ${roomId} → ${resp.status}`);
    const body = await resp.json() as { chunk?: RoomEvent[]; end?: string };
    const chunk = body.chunk ?? [];
    events.push(...chunk);
    const oldest = chunk[chunk.length - 1]?.origin_server_ts ?? 0;
    if (!body.end || chunk.length < PAGE_SIZE || oldest <= sinceTs) break;
    from = body.end;
  }
  return events;
}

/**
 * The room's public read receipts, read by the bot, which sits in every switched room. Any failure
 * answers []: the mail then goes out anyway (spec §9.1).
 */
async function readRoomReceipts(roomId: string, token: string): Promise<Record<string, unknown>[]> {
  try {
    const filter = JSON.stringify({
      account_data: { types: [] }, presence: { types: [] },
      room: { rooms: [roomId], account_data: { types: [] }, state: { types: [] }, timeline: { limit: 0 }, ephemeral: { types: ['m.receipt'] } },
    });
    const resp = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/sync?${new URLSearchParams({ filter, timeout: '0' })}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`sync → ${resp.status}`);
    const body = await resp.json() as { rooms?: { join?: Record<string, { ephemeral?: { events?: { type?: string; content?: Record<string, unknown> }[] } }> } };
    return (body.rooms?.join?.[roomId]?.ephemeral?.events ?? []).filter((e) => e.type === 'm.receipt').map((e) => e.content ?? {});
  } catch (e) {
    console.warn(`${JOB_NAME}: read receipts of ${roomId} unavailable, mailing anyway:`, e);
    return [];
  }
}

async function senderNames(matrixUserIds: string[], keys: Map<string, string>): Promise<Map<string, string>> {
  const entries = await Promise.all(matrixUserIds.map(async (id): Promise<[string, string]> => {
    const key = keys.get(localpartOf(id));
    return [id, (key ? await resolvePersonDisplayName(key) : undefined) ?? localpartOf(id)];
  }));
  return new Map(entries);
}

/** Queue the digests of one room. Returns the number of mails; throws leave the cursor where it is. */
async function mailRoom(db: Firestore, roomId: string, room: ChatEmailRoomDoc, untilTs: number, token: string, botUserId: string): Promise<number> {
  const tenants = await getRoomTenantMarker(roomId, token, { strict: true });
  if (!tenants?.length) return 0;   // no tenant, no mail: it could leak into the wrong one
  const events = await readRoomEvents(roomId, room.cursor, token);
  const messages = digestMessages(events, room.cursor, untilTs, botUserId);
  if (messages.length === 0) return 0;

  const [members, receipts, keys, summary, group] = await Promise.all([
    getJoinedMemberIds(roomId, token), readRoomReceipts(roomId, token), personKeysByLocalpart(db, tenants),
    getRoomSummary(roomId, token), groupOfRoom(roomId, token),
  ]);
  const read = readUpTo(receipts, events);
  const names = await senderNames([...new Set(messages.map((m) => m.sender))], keys);
  const groupKey = typeof group?.['okey'] === 'string' ? group['okey'] : groupKeyFromRoomAlias(summary?.canonicalAlias);
  const path = chatDeepLink(roomId, groupKey && await hasGroupChatPage(groupKey) ? groupKey : undefined);
  const chatName = String(group?.['name'] ?? summary?.name ?? '') || 'deinem Chat';
  const deps = createFirestoreDeps();
  const day = getTodayStr(DateFormat.StoreDate);
  const now = Date.now();
  let mailed = 0;

  for (const member of members) {
    const personKey = keys.get(localpartOf(member));
    if (member === botUserId || !personKey) continue;
    const mine = messagesForMember(messages, member, read.get(member) ?? 0);
    if (mine.length === 0) continue;
    try {
      const accounts = (await db.collection('users').where('personKey', '==', personKey).get()).docs.map((d) => ({ uid: d.id, ...d.data() }));
      const tenantId = tenants.find((t) => selectUserDocs(accounts, t).length > 0);
      if (!tenantId) continue;
      const [account] = selectUserDocs(accounts, tenantId) as { newsDelivery?: unknown }[];
      if (!wantsEmail(account.newsDelivery)) continue;
      const mute = await getUserGlobalAccountData(member, OKR_MUTE_EVENT, token).catch(() => undefined);
      if (muteBlocksPush(mute, roomId, tenantId, now, false)) continue;
      const to = await deps.emailFor(personKey, tenantId);
      if (!to) continue;

      const links = await tenantLinks(tenantId);
      const { shown, more } = capMessages(mine);
      const { subject, html } = chatDigestEmail({
        ...brandOf(links), chatName, chatUrl: `${links.appUrl}${path}`, more,
        messages: shown.map((m) => ({ senderName: names.get(m.sender) ?? '', ts: m.ts, text: m.text })),
      });
      const doc: OutboxDoc = {
        tenants: [tenantId], kind: 'sendEmail', ruleKey: `chat-email:${roomId}`, day, state: 'pending',
        // transient: the body is chat content, onWorkflowOutbox blanks it once it is handled.
        payload: { to, subject, body: html, template: '', transient: '1' },
      };
      await db.collection(WorkflowOutboxCollection).doc(digestOutboxId(roomId, personKey, room.cursor)).create(doc);
      mailed++;
    } catch (e) {
      // ALREADY_EXISTS is the repeat of a crashed run. One recipient never stops the others.
      if ((e as { code?: number }).code !== 6) console.warn(`${JOB_NAME}: one recipient of ${roomId} failed:`, e);
    }
  }
  return mailed;
}

export async function runChatEmailDigests(): Promise<void> {
  const db = getFirestore();
  const token = matrixAdminToken.value();
  const snap = await db.collection(ChatEmailRoomsCollection).where('enabled', '==', true).get();
  if (snap.empty) return;
  const botUserId = await fetchBotUserId(token);
  const untilTs = Date.now() - CHAT_EMAIL_GRACE_MS;
  let mailed = 0, failed = 0;
  for (const d of snap.docs) {
    const room = d.data() as ChatEmailRoomDoc;
    if (room.cursor >= untilTs) continue;   // switched on minutes ago
    try {
      mailed += await mailRoom(db, d.id, room, untilTs, token, botUserId);
      await d.ref.update({ cursor: untilTs });
    } catch (e) {
      failed++;
      console.error(`${JOB_NAME}: ${d.id} failed, retrying next run:`, e);
    }
  }
  console.log(`${JOB_NAME}: rooms=${snap.size} mailed=${mailed} failed=${failed}`);
}

export const sendChatEmailDigests = onSchedule(
  { schedule: '*/15 * * * *', timeZone: 'Europe/Zurich', region: REGION, timeoutSeconds: 300, memory: '256MiB', secrets: [matrixAdminToken] },
  runChatEmailDigests,
);
