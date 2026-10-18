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
  getJoinedMemberIds, MatrixTerminalError,
} from './shared';
import { fetchBotUserId, isOwnNotesRoom } from './notes-room';

/** Local twin of ChatReminderModel (@okr/shared-models) — functions cannot import libs. */
export type ChatReminderDoc = {
  okey: string; tenants: string[]; personKey: string; dueAt: number;
  state: 'pending' | 'sent' | 'cancelled';
  notesRoomId: string; bookmarkEventId: string; roomId: string; eventId: string; title: string;
  /** Retryable failures so far (Admin SDK only); MAX_FAILURES cancels. */
  failures?: number;
};

/** 12 sweeps × 5 minutes = one hour of retryable failures, then the reminder is cancelled. */
export const MAX_FAILURES = 12;

// No functions-side tenant i18n exists for matrix-simple (only workflow/engine.ts has one), so the German literal.
export const REMINDER_PREFIX = 'Erinnerung';
export const MAX_TITLE_CHARS = 200;

export type ReminderDeps = {
  getRoomEvent: typeof getRoomEvent;
  sendBotReply: typeof sendBotReply;
  resolveRoomAlias: typeof resolveRoomAlias;
  isOwnNotesRoom: typeof isOwnNotesRoom;
  getJoinedMemberIds: typeof getJoinedMemberIds;
  host: string;
  token: string;
  /** @bk2-bot's Matrix id, fetched once per sweep run. */
  botUserId: string;
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
    const aliased = await deps.resolveRoomAlias(alias, deps.token, { strict: true });
    if (!aliased || aliased !== doc.notesRoomId) return cancel(doc, 'notesRoomId is not the owner alias target');
    if (!(await deps.isOwnNotesRoom(doc.notesRoomId, tenant, deps.token, { strict: true, botUserId: deps.botUserId }))) {
      return cancel(doc, 'not an own notes room');
    }
    // Defence in depth: a notes room holds exactly the bot and its owner. A failed read throws (retry).
    const owner = `@${doc.personKey.toLowerCase()}:${deps.host}`;
    const members = await deps.getJoinedMemberIds(doc.notesRoomId, deps.token);
    if (members.size !== 2 || !members.has(deps.botUserId) || !members.has(owner)) {
      return cancel(doc, `unexpected members (${members.size})`);
    }

    const entry = await deps.getRoomEvent(doc.notesRoomId, doc.bookmarkEventId, deps.token);
    if (!entry) return 'cancelled';
    if (entry.sender !== owner) return cancel(doc, 'entry not sent by the owner');

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

/**
 * The stored retry counter, sanitised: rules keep clients from writing it, but never trust it —
 * a negative or non-numeric value would keep a broken doc in the sweep forever.
 */
export function storedFailures(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** Minimal slice of a Firestore QueryDocumentSnapshot, so the per-doc step is unit-testable. */
export type DueReminderSnap = { id: string; data: () => unknown; ref: { update: (patch: Record<string, unknown>) => Promise<unknown> } };

/**
 * Process one due reminder and write its outcome. A retryable failure bumps `failures`; the
 * MAX_FAILURES-th one cancels the reminder so a permanently broken doc stops being retried.
 */
export async function handleDueReminder(d: DueReminderSnap, deps: ReminderDeps): Promise<'sent' | 'cancelled' | 'failed'> {
  const data = d.data() as ChatReminderDoc;
  try {
    const state = await processReminder({ ...data, okey: d.id }, deps);
    await d.ref.update({ state });
    return state;
  } catch (error) {
    const failures = storedFailures(data.failures) + 1;
    console.error(`sendChatReminders: failed for ${d.id} (${failures}/${MAX_FAILURES}):`, error);
    await d.ref.update(failures >= MAX_FAILURES ? { failures, state: 'cancelled' } : { failures });
    return failures >= MAX_FAILURES ? 'cancelled' : 'failed';
  }
}

export const sendChatReminders = onSchedule(
  {
    schedule: 'every 5 minutes', timeZone: 'Europe/Zurich', region: 'europe-west6', timeoutSeconds: 300,
    secrets: [matrixAdminToken],
  },
  async () => {
    const token = matrixAdminToken.value();
    const snap = await getFirestore().collection('chatReminders')
      .where('state', '==', 'pending').where('dueAt', '<=', Date.now()).orderBy('dueAt').limit(200).get();
    if (snap.empty) return;
    // whoami once per run, not per doc. If it fails, nothing is touched; the next run retries.
    const botUserId = await fetchBotUserId(token);
    const deps: ReminderDeps = {
      getRoomEvent, sendBotReply, resolveRoomAlias, isOwnNotesRoom, getJoinedMemberIds,
      host: serverHostname(), token, botUserId,
    };
    let sent = 0, cancelled = 0, failed = 0;
    for (const d of snap.docs) {
      try {
        const outcome = await handleDueReminder(d, deps);
        if (outcome === 'sent') sent++; else if (outcome === 'cancelled') cancelled++; else failed++;
      } catch (error) {
        failed++;
        console.error(`sendChatReminders: could not record the outcome for ${d.id}:`, error);
      }
    }
    console.log(`sendChatReminders: due=${snap.size} sent=${sent} cancelled=${cancelled} failed=${failed}`);
  },
);
