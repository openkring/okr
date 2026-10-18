// apps/functions/src/matrix-simple/chat-reminders.ts
//
// Reminder sweep for chat bookmarks (spec 1.104 §5.3). Every 5 minutes, due `chatReminders` are
// delivered as an m.text rich reply to the bookmark entry in the owner's «Notizen an mich» room,
// posted by @bk2-bot (the admin-token account that created the room). m.text, not m.notice: a
// notice never raises a push; and no pushToPersons — Synapse's own push rules do the notifying.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';

import { matrixAdminToken, roomEventExists, sendBotReply } from './shared';

/** Local twin of ChatReminderModel (@okr/shared-models) — functions cannot import libs. */
export type ChatReminderDoc = {
  okey: string; tenants: string[]; personKey: string; dueAt: number;
  state: 'pending' | 'sent' | 'cancelled';
  notesRoomId: string; bookmarkEventId: string; roomId: string; eventId: string; title: string;
};

// No functions-side tenant i18n exists for matrix-simple (only workflow/engine.ts has one), so the German literal.
export const REMINDER_PREFIX = 'Erinnerung';

export type ReminderDeps = {
  roomEventExists: typeof roomEventExists;
  sendBotReply: typeof sendBotReply;
  token: string;
};

/** Delivers one reminder; errors propagate so the doc stays `pending` and the next sweep retries. */
export async function processReminder(doc: ChatReminderDoc, deps: ReminderDeps): Promise<'sent' | 'cancelled'> {
  if (!(await deps.roomEventExists(doc.notesRoomId, doc.bookmarkEventId, deps.token))) return 'cancelled';
  await deps.sendBotReply(
    doc.notesRoomId, doc.bookmarkEventId, `${REMINDER_PREFIX}: ${doc.title}`, `reminder_${doc.okey}`, deps.token,
  );
  return 'sent';
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
        const state = await processReminder({ ...(d.data() as ChatReminderDoc), okey: d.id }, { roomEventExists, sendBotReply, token });
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
