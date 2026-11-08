// apps/functions/src/email/mailing-answer.logic.ts
//
// Who may answer a Versand's events from the mail's personal link, and what the answer page shows
// per event. Pure functions; the endpoint (mailing-answer.ts) reads the docs and calls these.

import { Attendee, DeliveryChannel } from '@okr/shared-models';
import { splitAttendees } from '@okr/calendar-calevent-util';

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
