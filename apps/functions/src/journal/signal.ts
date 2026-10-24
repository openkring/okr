import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import type { Firestore } from 'firebase-admin/firestore';

import { JournalCollection, JournalPrivateCollection, JournalSignalRoomsDoc } from '@okr/shared-models';

import { MATRIX_HOMESERVER } from '../matrix-simple/shared';

/**
 * Signal messages for travel-journal guests (spec 1.113 §8.2, spike R6): sent as the journal's sender
 * (Bruno's Matrix account, logged into the mautrix-signal bridge with his own Signal account) into the
 * Signal portal room of the guest's number. The portal is found once with the bridge bot's `start-chat`
 * command and cached per guest in `journals/{jk}/private/signalRooms`. The token never leaves this module.
 */
export const journalSenderToken = defineSecret('MATRIX_JOURNAL_SENDER_TOKEN');

const E164 = /^\+[1-9]\d{6,14}$/;
const WAIT_ROUNDS = 10;

/** A phone number as Signal needs it (E.164), or '' when it cannot be one. */
export function toE164(raw: string): string {
  const compact = raw.replace(/[\s\-/().]/g, '').replace(/^00/, '+');
  return E164.test(compact) ? compact : '';
}

type Json = Record<string, unknown>;

async function matrix(token: string, method: string, path: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${MATRIX_HOMESERVER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) throw new Error(`matrix ${method} ${path.split('?')[0]} → ${res.status}`);
  return json;
}

/** A real Signal DM: a bridge puppet among the members, at most three members. */
async function isSignalDm(token: string, roomId: string): Promise<boolean> {
  const members = Object.keys(((await matrix(token, 'GET', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`))['joined'] ?? {}) as Json);
  return members.some((id) => id.startsWith('@signal_')) && members.length <= 3;
}

/** Opens (or finds) the portal room of a number through the bridge bot's `start-chat` command. */
async function openPortal(token: string, phone: string): Promise<string> {
  const me = await matrix(token, 'GET', '/_matrix/client/v3/account/whoami');
  const userId = String(me['user_id'] ?? '');
  const bot = `@signalbot:${userId.split(':')[1] ?? ''}`;
  const rooms = ((await matrix(token, 'GET', '/_matrix/client/v3/joined_rooms'))['joined_rooms'] ?? []) as string[];
  let management = '';
  for (const roomId of rooms) {
    const members = Object.keys(((await matrix(token, 'GET', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`).catch((): Json => ({})))['joined'] ?? {}) as Json);
    if (members.length === 2 && members.includes(bot)) { management = roomId; break; }
  }
  if (!management) throw new Error('no management room with the Signal bridge bot');
  let since = String((await matrix(token, 'GET', '/_matrix/client/v3/sync?timeout=0&filter={"room":{"timeline":{"limit":1}}}'))['next_batch'] ?? '');
  const sentAt = Date.now();
  await matrix(token, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(management)}/send/m.room.message/journal-${sentAt}`, { msgtype: 'm.text', body: `start-chat ${phone}` });
  for (let i = 0; i < WAIT_ROUNDS; i++) {
    const sync = await matrix(token, 'GET', `/_matrix/client/v3/sync?timeout=3000&since=${encodeURIComponent(since)}`);
    since = String(sync['next_batch'] ?? since);
    // a first chat with this number: the bridge invites us into a new portal
    const invites = (((sync['rooms'] as Json | undefined)?.['invite'] ?? {}) as Record<string, Json>);
    for (const roomId of Object.keys(invites)) {
      await matrix(token, 'POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/join`, {});
      if (await isSignalDm(token, roomId)) return roomId;
    }
    // an existing portal: the bot names it in its reply
    const chunk = ((await matrix(token, 'GET', `/_matrix/client/v3/rooms/${encodeURIComponent(management)}/messages?dir=b&limit=10`))['chunk'] ?? []) as Json[];
    for (const e of chunk) {
      if (e['sender'] !== bot || Number(e['origin_server_ts'] ?? 0) < sentAt) continue;
      const content = (e['content'] ?? {}) as Json;
      const match = decodeURIComponent(`${content['body'] ?? ''} ${content['formatted_body'] ?? ''}`).match(/(![A-Za-z0-9_-]+:[A-Za-z0-9.-]+)/);
      if (match && match[1] !== management) {
        await matrix(token, 'POST', `/_matrix/client/v3/join/${encodeURIComponent(match[1])}`, {}).catch(() => undefined);
        if (await isSignalDm(token, match[1])) return match[1];
      }
    }
  }
  throw new Error('no Signal portal within 30 s');
}

/** Sends one text to a guest over Signal. Returns false (and logs no number) when it could not be sent. */
export async function sendSignal(db: Firestore, journalKey: string, personKey: string, phone: string, text: string): Promise<boolean> {
  const token = journalSenderToken.value();
  const number = toE164(phone);
  if (!token || !number) return false;
  const roomsRef = db.doc(`${JournalCollection}/${journalKey}/${JournalPrivateCollection}/${JournalSignalRoomsDoc}`);
  try {
    let roomId = String((await roomsRef.get()).data()?.[personKey] ?? '');
    if (!roomId) {
      roomId = await openPortal(token, number);
      await roomsRef.set({ [personKey]: roomId }, { merge: true });
    }
    await matrix(token, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/journal-${Date.now()}-${personKey}`, { msgtype: 'm.text', body: text });
    return true;
  } catch (error) {
    logger.warn(`journal signal: not sent to one guest of ${journalKey}`, { error: String((error as Error)?.message ?? error) });
    return false;
  }
}
