// apps/functions/src/calendar/notify.ts
//
// §1 of `planning/specs/2026-08-25-participant-messaging-spec.md`: «Teilnehmende
// benachrichtigen» — the organiser of a calendar event reaches its participants at short
// notice, without founding a group and WITHOUT CREATING A SINGLE CHAT ROOM.
//
// That last part is the whole design. The system bot already owns one direct room per person
// (`workflow/matrix-bot.ts` → `ensureDirectRoom`, recorded in the bot's `m.direct` account
// data and reused for life). A broadcast to twenty participants therefore opens zero rooms —
// which is why this is not the "temporary rooms swept after the event" feature that was
// considered and rejected (spec §3.5).
//
// Two channels, deliberately:
//  - FCM push, sent straight from here (needs no secret) — the fast one;
//  - a bot DM per recipient, queued on the workflow outbox — the durable one. Whoever missed
//    the push, or re-installs, still finds the message in their chat.
// Plus a comment on the event as the record (§1.4), tagged so §2 does not notify about it.
//
// THE CLIENT NEVER NAMES THE RECIPIENTS — see the head of `recipients.ts`.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { getCallerRoles, requireParam, requireUserPersonKey, checkRateLimit, serverHostname } from '../matrix-simple/shared';
import { OutboxDoc, WorkflowOutboxCollection } from '../workflow/outbox';
import { pushToPersons } from '../srv/push';
import { BROADCAST_TAG } from './activity';
import { CalEventNotifyDoc, NotifyScope, resolveCalEventRecipients, shorten, todayStoreDate } from './recipients';

const REGION = 'europe-west6';
const CF_NAME = 'notifyCalEventParticipants';

/**
 * Roles that may address the participants of ANY event in their tenant. Kept in sync with
 * `canNotify` in `calevent-list.ts`, which decides whether the button is even offered — a
 * button the server then refuses is worse than no button.
 */
const PRIVILEGED_ROLES = ['admin', 'privileged', 'eventAdmin'];

/** Matches the form field; long enough for a real notice, short enough to stay a notice. */
const MAX_MESSAGE_LENGTH = 500;

/** Broadcasts per organiser per minute. A burst brake, not a quota. */
const MAX_BROADCASTS_PER_MINUTE = 5;

export interface NotifyParticipantsRequest {
  caleventKey: string;
  message: string;
  scope: NotifyScope;
}

export interface NotifyParticipantsResponse {
  /** How many people were addressed. Never the names — the log keeps counts only. */
  recipients: number;
}

/**
 * May this caller address the event's participants?
 *
 * An organiser of the event, or a privileged/admin user of the tenant. Everyone else is
 * refused — a broadcast is a megaphone, and the club's megaphone belongs to the people who
 * are already responsible for the date.
 */
function mayBroadcast(event: CalEventNotifyDoc, personKey: string, roles: Record<string, boolean>): boolean {
  const isOrganiser = (event.responsiblePersons ?? []).some((person) => person.key === personKey);
  return isOrganiser || PRIVILEGED_ROLES.some((role) => roles[role] === true);
}

/**
 * The Matrix id of a person, or '' when they have no account. Same derivation as
 * `workflow/firestore-deps.ts::matrixIdFor` — the localpart is the lowercased person okey.
 */
async function matrixIdFor(personKey: string): Promise<string> {
  const snap = await getFirestore().collection('users').where('personKey', '==', personKey).limit(1).get();
  return snap.empty ? '' : `@${personKey.toLowerCase()}:${serverHostname()}`;
}

/**
 * Queue one bot DM per recipient on the workflow outbox.
 *
 * The outbox is reused rather than re-implemented: it is the one function that holds
 * `MATRIX_BOT_TOKEN` (a Gen-2 secret binds to the function that uses it), and it brings
 * retry, the `txnId` dedup Synapse performs, and a failure record per row. `ruleKey` carries
 * the event instead of a rule — the outbox counts sends per `ruleKey`, so a broadcast counts
 * against itself and never against a workflow rule.
 *
 * ⚠️ The body carries the organiser's PLAIN TEXT. That is a deliberate exemption from the
 * pointer-only rule in `workflow/matrix-bot.ts` (decided 2026-08-25, spec §1.3): the rule
 * exists for machine-generated approval notices carrying amounts, reasons and third-party
 * names. A club notice is typed knowingly by a person, and the form says so.
 */
async function queueBotMessages(
  tenantId: string,
  caleventKey: string,
  sendId: string,
  body: string,
  personKeys: string[],
): Promise<number> {
  const db = getFirestore();
  const day = getTodayStr(DateFormat.StoreDate);
  let queued = 0;

  await Promise.all(personKeys.map(async (personKey) => {
    const matrixUserId = await matrixIdFor(personKey);
    if (!matrixUserId) return;                       // no account → no chat channel
    const doc: OutboxDoc = {
      tenants: [tenantId],
      kind: 'sendMessage',
      ruleKey: `calevent:${caleventKey}`,
      day,
      state: 'pending',
      payload: { matrixUserId, body, txnId: `cal-${caleventKey}-${sendId}-${personKey}` },
    };
    await db.collection(WorkflowOutboxCollection).add(doc);
    queued += 1;
  }));

  return queued;
}

/**
 * The record of the broadcast on the event itself (§1.4).
 *
 * Written as an ordinary comment so it shows up in the comment card that is already mounted
 * on both event modals — no second history view to build, and someone who joins later can
 * still read what was announced. The `broadcast` tag is what stops `onCalEventCommentCreated`
 * from notifying the same people a second time about their own notification.
 */
async function writeBroadcastRecord(
  tenantId: string,
  caleventKey: string,
  authorKey: string,
  authorName: string,
  message: string,
): Promise<void> {
  const parentKey = `calevent.${caleventKey}`;
  const creationDateTime = getTodayStr(DateFormat.StoreDateTime);
  await getFirestore().collection('comments').add({
    parentKey,
    authorKey,
    authorName,
    description: message,
    creationDateTime,
    attachmentKeys: [],
    tags: BROADCAST_TAG,
    // same shape as `getCommentIndex` in `@okr/comment-util` — a lib cannot be imported here,
    // and a comment written with a different index would drop out of every comment search
    index: `ak:${authorKey}, d:${creationDateTime}, pk:${parentKey}`,
    isArchived: false,
    tenants: [tenantId],
  });
  // `okey` is deliberately absent: it is the document id, stripped before every write and
  // re-attached on read (CLAUDE.md), and `add()` mints the id.
}

/**
 * Send a short notice to the participants of a calendar event.
 *
 * @param caleventKey the event that was acted on
 * @param message     free text, max 500 characters
 * @param scope       'event' (this occurrence) or 'series' (this and all future occurrences)
 */
export const notifyCalEventParticipants = onCall(
  { cors: true, region: REGION, enforceAppCheck: true },
  async (request): Promise<NotifyParticipantsResponse> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Not authenticated');
    checkRateLimit(uid, CF_NAME, MAX_BROADCASTS_PER_MINUTE);

    const { caleventKey, message, scope } = request.data as NotifyParticipantsRequest;
    requireParam(caleventKey, 'caleventKey');
    requireParam(message, 'message', MAX_MESSAGE_LENGTH);
    const notifyScope: NotifyScope = scope === 'series' ? 'series' : 'event';

    const senderKey = await requireUserPersonKey(uid, CF_NAME);
    const { events, personKeys } = await resolveCalEventRecipients(
      caleventKey, notifyScope, todayStoreDate(), [senderKey]);

    const event = events.find((candidate) => candidate.okey === caleventKey) ?? events[0];
    if (!event) throw new HttpsError('not-found', 'Event not found');
    if (event.isArchived) throw new HttpsError('failed-precondition', 'Event is archived');

    if (!mayBroadcast(event, senderKey, await getCallerRoles(uid))) {
      console.error(`${CF_NAME}: uid ${uid} is neither organiser of ${caleventKey} nor privileged`);
      throw new HttpsError('permission-denied', 'Only the organisers of this event may notify its participants.');
    }

    const tenantId = event.tenants?.[0] ?? '';
    if (!tenantId) throw new HttpsError('failed-precondition', 'Event has no tenant');

    if (personKeys.length === 0) {
      logger.info(`${CF_NAME}: no recipients for ${caleventKey} (scope ${notifyScope})`);
      return { recipients: 0 };
    }

    const body = `${event.name ?? ''}: ${message.trim()}`;
    // One id per broadcast, so a retried delivery is deduped by Synapse. Resolution is one
    // second: two notices about the same event within the same second would collapse into one.
    // Acceptable — the rate limit above already caps an organiser at 5 per minute, and nobody
    // writes two distinct notices in the same second.
    const sendId = getTodayStr(DateFormat.StoreDateTime);

    await pushToPersons(
      personKeys,
      {
        type: 'calevent',
        title: event.name ?? '',
        body: shorten(message, 160),
        url: `/calevent/${caleventKey}`,
        channelId: `calevent.${caleventKey}`,
      },
      CF_NAME,
    );

    const queued = await queueBotMessages(tenantId, caleventKey, sendId, body, personKeys);

    const sender = await getFirestore().collection('users').doc(uid).get();
    const senderName = [sender.data()?.['firstName'], sender.data()?.['lastName']].filter(Boolean).join(' ');
    await writeBroadcastRecord(tenantId, caleventKey, senderKey, senderName, message.trim());

    // Recipient COUNT, never the addresses — same rule as the outbox's send log.
    logger.info(`${CF_NAME}: notified ${personKeys.length} participant(s) of ${caleventKey} (scope ${notifyScope}, ${queued} chat message(s) queued)`);
    return { recipients: personKeys.length };
  },
);
