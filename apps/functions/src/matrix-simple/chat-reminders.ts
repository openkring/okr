// apps/functions/src/matrix-simple/chat-reminders.ts
//
// Reminder sweep for chat bookmarks (spec 1.104 §5.3). Every 5 minutes, due `chatReminders` are
// delivered as an m.text rich reply to the bookmark entry in the owner's «Notizen an mich» room,
// posted by @bk2-bot (the admin-token account that created the room). m.text, not m.notice: a
// notice never raises a push; and no pushToPersons — Synapse's own push rules do the notifying.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';

import {
  matrixAdminToken, getRoomEvent, sendBotReply, resolveRoomAlias, serverHostname, notesRoomAliasLocalpart,
  MatrixTerminalError,
} from './shared';
import { isOwnNotesRoom } from './notes-room';

/** Local twin of ChatReminderModel (@okr/shared-models) — functions cannot import libs. */
export type ChatReminderDoc = {
  okey: string; tenants: string[]; personKey: string; dueAt: number;
  state: 'pending' | 'sent' | 'cancelled';
  notesRoomId: string; bookmarkEventId: string; roomId: string; eventId: string; title: string;
};

// No functions-side tenant i18n exists for matrix-simple (only workflow/engine.ts has one), so the German literal.
export const REMINDER_PREFIX = 'Erinnerung';
export const MAX_TITLE_CHARS = 200;

export type ReminderDeps = {
  getRoomEvent: typeof getRoomEvent;
  sendBotReply: typeof sendBotReply;
  resolveRoomAlias: typeof resolveRoomAlias;
  isOwnNotesRoom: typeof isOwnNotesRoom;
  host: string;
  token: string;
};

/**
 * Delivers one reminder. `notesRoomId`, `bookmarkEventId` and `title` are client-written, so the
 * room must be the owner's own notes room and the entry must be the owner's — otherwise the bot
 * could be made to post into any room it sits in. Mismatch, vanished entry or a terminal Matrix
 * error → 'cancelled'. Other errors propagate so the doc stays `pending` and the next sweep retries.
 */
export async function processReminder(doc: ChatReminderDoc, deps: ReminderDeps): Promise<'sent' | 'cancelled'> {
  if (doc.tenants?.length !== 1) return cancel(doc, 'tenants is not a single tenant');
  const tenant = doc.tenants[0];
  try {
    const alias = `#${notesRoomAliasLocalpart(tenant, doc.personKey)}:${deps.host}`;
    const aliased = await deps.resolveRoomAlias(alias, deps.token);
    if (!aliased || aliased !== doc.notesRoomId) return cancel(doc, 'notesRoomId is not the owner alias target');
    if (!(await deps.isOwnNotesRoom(doc.notesRoomId, tenant, deps.token))) return cancel(doc, 'not an own notes room');

    const entry = await deps.getRoomEvent(doc.notesRoomId, doc.bookmarkEventId, deps.token);
    if (!entry) return 'cancelled';
    if (entry.sender !== `@${doc.personKey.toLowerCase()}:${deps.host}`) return cancel(doc, 'entry not sent by the owner');

    const title = Array.from(doc.title ?? '').slice(0, MAX_TITLE_CHARS).join('');
    await deps.sendBotReply(
      doc.notesRoomId, doc.bookmarkEventId, `${REMINDER_PREFIX}: ${title}`, `reminder_${doc.okey}`, deps.token,
    );
    return 'sent';
  } catch (error) {
    if (error instanceof MatrixTerminalError) return cancel(doc, error.message);
    throw error;
  }
}

function cancel(doc: ChatReminderDoc, reason: string): 'cancelled' {
  console.warn(`sendChatReminders: cancelling ${doc.okey}: ${reason}`);
  return 'cancelled';
}

export const sendChatReminders = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Europe/Zurich', region: 'europe-west6', secrets: [matrixAdminToken] },
  async () => {
    const token = matrixAdminToken.value();
    const snap = await getFirestore().collection('chatReminders')
      .where('state', '==', 'pending').where('dueAt', '<=', Date.now()).limit(200).get();
    let sent = 0, cancelled = 0, failed = 0;
    for (const d of snap.docs) {
      try {
        const state = await processReminder({ ...(d.data() as ChatReminderDoc), okey: d.id }, { getRoomEvent, sendBotReply, resolveRoomAlias, isOwnNotesRoom, host: serverHostname(), token });
        await d.ref.update({ state });
        if (state === 'sent') sent++; else cancelled++;
      } catch (error) {
        failed++;
        console.error(`sendChatReminders: failed for ${d.id}:`, error);
      }
    }
    console.log(`sendChatReminders: due=${snap.size} sent=${sent} cancelled=${cancelled} failed=${failed}`);
  },
);
