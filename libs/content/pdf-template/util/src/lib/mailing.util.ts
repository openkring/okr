// libs/content/pdf-template/util/src/lib/mailing.util.ts
import { Attendee, DeliveryChannel } from '@okr/shared-models';

/**
 * A sent Versand as the overview reads it: the `mailings/{key}` doc (`MailingDoc` in
 * `apps/functions/src/email/mailing.ts`). Read-only on the client: `sendMailing` writes it and
 * `onMailing` sets `state`, the counts and the keys of what it created. The firestore rules let
 * privileged / memberAdmin of the tenant read it, nobody write it.
 *
 * Kept here instead of in shared-models on purpose: the client never creates one, so it is a view
 * of a server document, not a model with defaults.
 */
export interface MailingView {
  okey: string;
  tenants: string[];
  senderKey?: string;
  senderName?: string;
  subject?: string;
  from?: string;
  attachmentName?: string;
  attachments?: { filename: string }[];
  deliveries?: { personKey: string; channels: string[] }[];
  /** StoreDateTime */
  createdAt?: string;
  state?: MailingState;
  error?: string;
  emails?: number;
  notices?: number;
  pushes?: number;
  mailJobKey?: string;
  noticeKey?: string;
  letters?: { state: 'pending' | 'ready' | 'failed'; storagePath?: string; count?: number; missing?: number; error?: string };
  caleventKeys?: string[];
  /** StoreDate: the answer links stop working after it */
  validUntil?: string;
}

export type MailingState = 'pending' | 'sent' | 'failed';

/** The answer of one recipient on one event: a yes beyond maxAttendees is on the waiting list. */
export type MailingAnswer = 'accepted' | 'waiting' | 'declined' | 'open';

/** The order the overview lists the delivery types in. */
export const MAILING_VIEW_CHANNELS: string[] = [DeliveryChannel.Email, DeliveryChannel.Chat, DeliveryChannel.Post];

/** Newest first; a Versand without a date goes last. Returns a new array. */
export function sortMailingsNewestFirst<T extends Pick<MailingView, 'createdAt'>>(mailings: T[]): T[] {
  return [...mailings].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/** How many recipients were ticked per delivery type. */
export function mailingChannelCounts(deliveries: MailingView['deliveries']): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(MAILING_VIEW_CHANNELS.map((c) => [c, 0]));
  for (const delivery of deliveries ?? []) {
    for (const channel of delivery.channels ?? []) counts[channel] = (counts[channel] ?? 0) + 1;
  }
  return counts;
}

/** The personKeys ticked for one delivery type, in the order of the Versand. */
export function mailingRecipientsFor(deliveries: MailingView['deliveries'], channel: string): string[] {
  return (deliveries ?? []).filter((d) => (d.channels ?? []).includes(channel)).map((d) => d.personKey);
}

/** The Ionic color of a state chip; a failed mail job or failed letters turn a sent Versand into a warning. */
export function mailingStateColor(state: string | undefined, partlyFailed = false): string {
  if (state === 'failed') return 'danger';
  if (state === 'sent') return partlyFailed ? 'warning' : 'success';
  return 'medium';
}

/** '3/5' while a mail job has more than one block or personal mail, '' otherwise. */
export function mailJobProgress(job: { blocksSent?: number; blocksTotal?: number } | undefined): string {
  const total = job?.blocksTotal ?? 0;
  return total > 0 ? `${job?.blocksSent ?? 0}/${total}` : '';
}

/**
 * Where a person stands on an event, as the answer page shows it (`attendeeStateOf` in
 * `apps/functions/src/email/mailing-answer.logic.ts`, same rule): the first `maxAttendees` yeses are in,
 * the later ones wait; a declined entry is a no; anything else, or no entry, is open.
 */
export function mailingAnswerOf(attendees: Attendee[] | undefined, maxAttendees: number | undefined, personKey: string): MailingAnswer {
  const accepted = (attendees ?? []).filter((a) => a.state === 'accepted');
  const cap = maxAttendees ?? 0;
  const index = accepted.findIndex((a) => a.person?.key === personKey);
  if (index >= 0) return cap > 0 && index >= cap ? 'waiting' : 'accepted';
  if ((attendees ?? []).some((a) => a.person?.key === personKey && a.state === 'declined')) return 'declined';
  return 'open';
}

/** How many recipients gave each answer. */
export function mailingAnswerCounts(answers: MailingAnswer[]): Record<MailingAnswer, number> {
  const counts: Record<MailingAnswer, number> = { accepted: 0, waiting: 0, declined: 0, open: 0 };
  for (const answer of answers) counts[answer]++;
  return counts;
}

/** The Ionic color of an answer badge. */
export function mailingAnswerColor(answer: MailingAnswer): string {
  switch (answer) {
    case 'accepted': return 'success';
    case 'waiting': return 'warning';
    case 'declined': return 'danger';
    default: return 'medium';
  }
}

/**
 * What the mail server reported for one E-Mail (`getMailingDeliveries`, from the Mailtrap events).
 * `delivered`: the receiving server took it; `deferred`: a soft bounce, the provider retries;
 * `rejected`: it will not arrive; `spam`: delivered and marked as spam by the recipient.
 */
export type MailDeliveryStatus = 'delivered' | 'deferred' | 'rejected' | 'spam';

export interface MailDelivery {
  status: MailDeliveryStatus;
  /** why it was rejected or deferred, without addresses */
  reason?: string;
  /** ISO time */
  at?: string;
}

/** The answer of `getMailingDeliveries`. A recipient missing from `recipients` has no report yet. */
export interface MailingDeliveries {
  recipients: ({ personKey: string } & MailDelivery)[];
  /** the Versand's own To/Cc/sender addresses, which the caller already sees on the mailings doc */
  addresses: ({ email: string } & MailDelivery)[];
  /** reports for addresses that match no recipient any more (e.g. changed since) */
  unmatched: number;
  truncated?: boolean;
}

/** Whether the mail server reported anything at all (else the Versand predates the reports, or they expired). */
export function hasDeliveryReports(deliveries: MailingDeliveries | undefined): boolean {
  return !!deliveries && (deliveries.recipients.length > 0 || deliveries.addresses.length > 0 || deliveries.unmatched > 0);
}

/** personKey → its report. */
export function deliveryByPerson(deliveries: MailingDeliveries | undefined): Map<string, MailDelivery> {
  return new Map((deliveries?.recipients ?? []).map(({ personKey, ...delivery }) => [personKey, delivery]));
}

/** How many E-Mail recipients have which status; `pending` = no report yet. */
export function deliveryStatusCounts(personKeys: string[], byPerson: Map<string, MailDelivery>): Record<MailDeliveryStatus | 'pending', number> {
  const counts: Record<MailDeliveryStatus | 'pending', number> = { delivered: 0, deferred: 0, rejected: 0, spam: 0, pending: 0 };
  for (const key of personKeys) counts[byPerson.get(key)?.status ?? 'pending']++;
  return counts;
}

/** The Ionic color of a delivery badge. */
export function deliveryStatusColor(status: MailDeliveryStatus | 'pending'): string {
  switch (status) {
    case 'delivered': return 'success';
    case 'deferred': return 'warning';
    case 'spam': return 'warning';
    case 'rejected': return 'danger';
    default: return 'medium';
  }
}
