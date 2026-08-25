// apps/functions/src/calendar/recipients.ts
//
// Who gets told about a calendar event — the single recipient resolver behind the
// participant broadcast (§1) and the comment/document notifications (§2) of
// `planning/specs/2026-08-25-participant-messaging-spec.md`.
//
// ⚠️ THE CLIENT NEVER SUPPLIES A RECIPIENT LIST. It sends the event key and nothing else; the
// set is derived here from `attendees[]` / `invitations`. A hand-typed recipient list is
// exactly the abuse path the workflow engine already refuses ("eine Regel kann keinen frei
// getippten Empfänger nennen"), and a broadcast action must not reopen it.
//
// The pure functions carry the rules and are unit-tested; only the resolver touches Firestore.

import { getFirestore } from 'firebase-admin/firestore';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

/** Which occurrences a broadcast covers. */
export type NotifyScope = 'event' | 'series';

/** Invitation states that still count as a recipient — everything except an explicit 'declined'. */
const REACHABLE_INVITATION_STATES = ['accepted', 'maybe', 'pending'];

export interface AttendeeDoc {
  person?: { key?: string };
  state?: string;
}

export interface CalEventNotifyDoc {
  okey: string;
  name?: string;
  startDate?: string;
  startTime?: string;
  durationMinutes?: number;
  seriesId?: string;
  isOpen?: boolean;
  isArchived?: boolean;
  state?: string;
  attendees?: AttendeeDoc[];
  responsiblePersons?: { key?: string }[];
  tenants?: string[];
}

export interface InvitationNotifyDoc {
  inviteeKey?: string;
  caleventKey?: string;
  state?: string;
  isArchived?: boolean;
}

/** Person keys of everyone who said yes to an OPEN event. */
export function acceptedAttendeeKeys(event: CalEventNotifyDoc): string[] {
  return (event.attendees ?? [])
    .filter((attendee) => attendee.state === 'accepted')
    .map((attendee) => attendee.person?.key ?? '')
    .filter((key) => key.length > 0);
}

/** Person keys that declined — subtracted last, see `collectRecipients`. */
export function declinedAttendeeKeys(event: CalEventNotifyDoc): string[] {
  return (event.attendees ?? [])
    .filter((attendee) => attendee.state === 'declined')
    .map((attendee) => attendee.person?.key ?? '')
    .filter((key) => key.length > 0);
}

/** Person keys of everyone still on the invitation list of a CLOSED event. */
export function invitedPersonKeys(invitations: InvitationNotifyDoc[]): string[] {
  return invitations
    .filter((invitation) => !invitation.isArchived)
    .filter((invitation) => REACHABLE_INVITATION_STATES.includes(invitation.state ?? ''))
    .map((invitation) => invitation.inviteeKey ?? '')
    .filter((key) => key.length > 0);
}

/** Person keys of the organisers. */
export function responsibleKeys(event: CalEventNotifyDoc): string[] {
  return (event.responsiblePersons ?? [])
    .map((person) => person.key ?? '')
    .filter((key) => key.length > 0);
}

/**
 * The recipient set of one or more occurrences.
 *
 * Rules, in order:
 *  1. per event: accepted attendees (open) or live invitations (closed), plus the organisers;
 *  2. minus everyone who declined — **including an organiser who declined**. Declining is an
 *     explicit "not me, not this date"; honouring the organiser role over it would make the
 *     opt-out un-exercisable for exactly the people most likely to lead a different session;
 *  3. minus `exclude` — the sender, or the author of the comment/document that triggered this.
 *
 * @param events      the occurrences in scope (one, or the future ones of a series)
 * @param invitations invitations of those events; ignored for open events
 * @param exclude     person keys to drop (sender/author)
 */
export function collectRecipients(
  events: CalEventNotifyDoc[],
  invitations: InvitationNotifyDoc[],
  exclude: string[] = [],
): string[] {
  const recipients = new Set<string>();
  const declined = new Set<string>();

  for (const event of events) {
    if (event.isArchived) continue;
    const fromEvent = event.isOpen
      ? acceptedAttendeeKeys(event)
      : invitedPersonKeys(invitations.filter((invitation) => invitation.caleventKey === event.okey));
    for (const key of [...fromEvent, ...responsibleKeys(event)]) recipients.add(key);
    for (const key of declinedAttendeeKeys(event)) declined.add(key);
  }

  for (const key of declined) recipients.delete(key);
  for (const key of exclude) recipients.delete(key);
  return [...recipients];
}

/** `true` once the event lies in the past — a broadcast about it would be pointless. */
export function isFutureOrToday(startDate: string, today: string): boolean {
  return startDate >= today;
}

/**
 * Load the occurrences a broadcast covers.
 *
 * 'event'  — just this one.
 * 'series' — this one plus every later, non-archived occurrence of the same series. A past
 *            occurrence is never included: nobody needs to hear about last week's training.
 */
export async function loadCalEventsInScope(
  caleventKey: string,
  scope: NotifyScope,
  today: string,
): Promise<CalEventNotifyDoc[]> {
  const db = getFirestore();
  const snap = await db.collection('calevents').doc(caleventKey).get();
  if (!snap.exists) return [];
  const event = { ...snap.data(), okey: snap.id } as CalEventNotifyDoc;
  if (scope === 'event' || !event.seriesId) return [event];

  const seriesSnap = await db.collection('calevents')
    .where('seriesId', '==', event.seriesId)
    .where('isArchived', '==', false)
    .get();
  const occurrences = seriesSnap.docs
    .map((doc) => ({ ...doc.data(), okey: doc.id } as CalEventNotifyDoc))
    .filter((occurrence) => isFutureOrToday(occurrence.startDate ?? '', today));

  // The triggering event stays in even if it started earlier today — it is what the user acted on.
  return occurrences.some((occurrence) => occurrence.okey === event.okey) ? occurrences : [event, ...occurrences];
}

/** Invitations of the given events (closed events only; an open event has none). */
export async function loadInvitations(events: CalEventNotifyDoc[]): Promise<InvitationNotifyDoc[]> {
  const closed = events.filter((event) => !event.isOpen).map((event) => event.okey);
  if (closed.length === 0) return [];

  const db = getFirestore();
  // Firestore caps an `in` filter at 30 values — chunk rather than silently truncating.
  const chunks: string[][] = [];
  for (let i = 0; i < closed.length; i += 30) chunks.push(closed.slice(i, i + 30));

  const results = await Promise.all(chunks.map((chunk) =>
    db.collection('invitations').where('caleventKey', 'in', chunk).get()));
  return results.flatMap((snap) => snap.docs.map((doc) => doc.data() as InvitationNotifyDoc));
}

/**
 * Everyone to notify about `caleventKey`, ready to hand to `pushToPersons`.
 *
 * @param caleventKey the event that was acted on
 * @param scope       this occurrence, or this and all future ones of its series
 * @param today       StoreDate (yyyyMMdd) — passed in so the series cut-off is testable
 * @param exclude     sender or author, never notified about their own action
 */
export async function resolveCalEventRecipients(
  caleventKey: string,
  scope: NotifyScope,
  today: string,
  exclude: string[] = [],
): Promise<{ events: CalEventNotifyDoc[]; personKeys: string[] }> {
  const events = await loadCalEventsInScope(caleventKey, scope, today);
  if (events.length === 0) return { events: [], personKeys: [] };
  const invitations = await loadInvitations(events);
  return { events, personKeys: collectRecipients(events, invitations, exclude) };
}

/** Today as a StoreDate (yyyyMMdd) — the series cut-off. */
export function todayStoreDate(): string {
  return getTodayStr(DateFormat.StoreDate);
}

/** The calevent key behind a `calevent.<okey>` parent/folder key, or '' for anything else. */
export function caleventKeyFromParent(parentKey: string | undefined): string {
  const prefix = 'calevent.';
  if (!parentKey || !parentKey.startsWith(prefix)) return '';
  return parentKey.slice(prefix.length);
}

/** The first `calevent.<okey>` among a document's folder keys, or '' when it hangs elsewhere. */
export function caleventKeyFromFolders(folderKeys: string[] | undefined): string {
  for (const folderKey of folderKeys ?? []) {
    const key = caleventKeyFromParent(folderKey);
    if (key) return key;
  }
  return '';
}

/**
 * `true` when a comment carries the given tag. Tags are one comma-separated string on the
 * model, so a substring test would match 'broadcaster' as 'broadcast'.
 */
export function hasTag(tags: string | undefined, tag: string): boolean {
  return (tags ?? '').split(',').map((entry) => entry.trim()).includes(tag);
}

/** Shorten to `max` characters for a notification body, without cutting mid-ellipsis. */
export function shorten(text: string | undefined, max = 120): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
