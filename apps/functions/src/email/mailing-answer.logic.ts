// apps/functions/src/email/mailing-answer.logic.ts
//
// Who may answer a Versand's events from the mail's personal link, and what the answer page shows
// per event. Pure functions; the endpoint (mailing-answer.ts) reads the docs and calls these.

import { Attendee, DeliveryChannel } from '@okr/shared-models';
import { splitAttendees } from '@okr/calendar-calevent-util';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { AnswerableEvent } from '../calendar/invitation';
import { AnswerRefusal, eventRefusalOf } from '../calendar/refusal';
import { keysFor, MailingDoc } from './mailing';

/** Whether `personKey` may still answer: ticked for email, the Versand asks about events, and the last one is not over. */
export function mayAnswer(doc: Pick<MailingDoc, 'deliveries' | 'caleventKeys' | 'validUntil'>, personKey: string, today: string): boolean {
  if (!doc.caleventKeys?.length || !doc.validUntil) return false;
  if (today > doc.validUntil) return false;
  return keysFor(doc.deliveries, DeliveryChannel.Email).includes(personKey);
}

/** The last day any of the events takes place (StoreDate); undefined without events. */
export function lastEventDate(events: { startDate?: string; endDate?: string }[]): string | undefined {
  const days = events.map((event) => event.endDate || event.startDate || '').filter((day) => day !== '');
  return days.length === 0 ? undefined : days.reduce((max, day) => (day > max ? day : max));
}

/**
 * Whether one event of the Versand may still be answered (undefined = yes). The event half of
 * decideAnswer (calendar/answer.ts), plus the rule that the key must be one the Versand asks about.
 */
export function eventRefusal(caleventKey: string, caleventKeys: string[], event: AnswerableEvent | undefined, today: string): AnswerRefusal | undefined {
  if (!caleventKeys.includes(caleventKey)) return 'invalid';
  return eventRefusalOf(event, today);
}

/** Whether the person's own invitation to the event is frozen (undefined = may answer; absent or archived = no invitation to protect). */
export function invitationRefusal(inv: { isArchived?: boolean; isLocked?: boolean } | undefined): AnswerRefusal | undefined {
  return inv && !inv.isArchived && inv.isLocked ? 'locked' : undefined;
}

/** Where the person stands on an event; a yes beyond maxAttendees is on the waiting list. */
export function attendeeStateOf(attendees: Attendee[] | undefined, maxAttendees: number | undefined, personKey: string): 'accepted' | 'waiting' | 'declined' | 'open' {
  const split = splitAttendees(attendees, maxAttendees);
  if (split.confirmed.some((a) => a.person.key === personKey)) return 'accepted';
  if (split.waiting.some((a) => a.person.key === personKey)) return 'waiting';
  if (split.others.some((a) => a.person.key === personKey && a.state === 'declined')) return 'declined';
  return 'open';
}

/** The comment as typed into the answer page: trimmed and cut to `max` characters. */
export function normalizeComment(value: string, max: number): string {
  return value.trim().slice(0, max);
}

/** How many comments one person may leave on one event from the answer page. */
export const MAILING_COMMENTS_PER_EVENT_MAX = 20;

/** A comment the person already left on the event, as the answer page lists it. */
export interface OwnComment { description: string; creationDateTime: string }

/**
 * Why a comment from the answer page is not written (undefined = write it). `duplicate`: the same text
 * as the person's latest comment — a reload re-posts the form. `limit`: too many comments on that event.
 */
export function commentRefusal(own: OwnComment[], text: string): 'empty' | 'duplicate' | 'limit' | undefined {
  if (!text) return 'empty';
  const latest = [...own].sort((a, b) => b.creationDateTime.localeCompare(a.creationDateTime))[0];
  if (latest?.description === text) return 'duplicate';
  if (own.length >= MAILING_COMMENTS_PER_EVENT_MAX) return 'limit';
  return undefined;
}

/** A comment's creationDateTime (StoreDateTime, yyyyMMddHHmm) as the page shows it: «08.11.2026, 12:00». */
export function commentWhen(creationDateTime: string): string {
  const date = convertDateFormatToString(creationDateTime.slice(0, 8), DateFormat.StoreDate, DateFormat.ViewDate, false);
  const time = creationDateTime.slice(8, 12);
  return time.length === 4 ? `${date}, ${time.slice(0, 2)}:${time.slice(2)}` : date;
}

/** A comment on calevent.<okey>, shaped as the app's comment list writes it (CommentModel). */
export function caleventCommentDoc(caleventKey: string, personKey: string, authorName: string, text: string, now: string, tenantId: string): Record<string, unknown> {
  const parentKey = `calevent.${caleventKey}`;
  return {
    parentKey,
    isArchived: false,
    tenants: [tenantId],
    description: text,
    authorKey: personKey,
    authorName,
    creationDateTime: now,
    tags: '',
    attachmentKeys: [],
    index: `ak:${personKey}, d:${now}, pk:${parentKey}`,
  };
}

/**
 * No script, no plugins, no framing; inline styles, forms only to this function. Images only from the fixed
 * image CDN: the frame is tenant-editable, and a CSS attribute selector on the hidden signature field could
 * otherwise leak it through a background-image URL.
 */
export const ANSWER_PAGE_CSP = "default-src 'none'; img-src https://bkaiser.imgix.net data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const PAGE_VIEWPORT = '<meta name="viewport" content="width=device-width,initial-scale=1">';

/**
 * Neutralises every meta element of the frame (a meta refresh would navigate away despite the CSP) by renaming
 * the tag: `<x-meta …>` is no meta element, whatever its attributes or quoting, so no parser differential.
 * Then sets our own viewport; the charset comes from the Content-Type header.
 */
export function neutralizeMeta(html: string): string {
  const renamed = html.replace(/<meta/gi, '<x-meta');
  const head = /<head(?:\s[^>]*)?>/i.exec(renamed);
  return head
    ? renamed.slice(0, head.index + head[0].length) + PAGE_VIEWPORT + renamed.slice(head.index + head[0].length)
    : PAGE_VIEWPORT + renamed;
}
