// apps/functions/src/email/mailing-deliveries.logic.ts
//
// What became of each E-Mail of a Versand, from the Mailtrap events in `emailEvents` (mailtrap-webhook.ts).
// Every mail of a Versand carries the Mailtrap category `mailing.<mailingKey>` (mail-job.ts), and every
// webhook event returns it, so the events of one Versand are one equality query. Pure functions; the
// callable (mailing-deliveries.ts) reads the docs and calls these.
//
// Privacy (privacy-model skill): the overview names recipients but shows no address. Events are matched to
// persons here, on the server, and only the personKey goes back. An address goes back only when the caller
// can read it already: the Versand's own To/Cc, which are on the `mailings` doc. A reason is stripped of
// addresses, since a provider's SMTP response often quotes the recipient.

/** The prefix of the Mailtrap category a Versand's mails carry. */
export const MAILING_CATEGORY_PREFIX = 'mailing.';

/** The Mailtrap category of every mail of one Versand. */
export function mailingCategory(mailingKey: string): string {
  return `${MAILING_CATEGORY_PREFIX}${mailingKey}`;
}

/**
 * Where one mail stands. `delivered`: the receiving server took it. `deferred`: a soft bounce, the provider
 * retries. `rejected`: a bounce, a reject or a suspension, it will not arrive. `spam`: delivered, and the
 * recipient marked it as spam. No events yet = still on its way; that is not a status the server sends.
 */
export type MailDeliveryStatus = 'delivered' | 'deferred' | 'rejected' | 'spam';

/** One `emailEvents` row, as far as this reads it. */
export interface EmailEventRow {
  event?: unknown;
  email?: unknown;
  timestamp?: unknown;
  reason?: unknown;
  bounce_category?: unknown;
  response?: unknown;
}

export interface MailDelivery {
  status: MailDeliveryStatus;
  /** why it was rejected or deferred, without addresses; absent otherwise */
  reason?: string;
  /** ISO time of the event the status comes from */
  at?: string;
}

/** The events that say whether the mail reached the receiving server, and what they mean. */
const DELIVERY_EVENTS: Record<string, MailDeliveryStatus> = {
  delivery: 'delivered',
  'soft bounce': 'deferred',
  soft_bounce: 'deferred',
  bounce: 'rejected',
  reject: 'rejected',
  suspension: 'rejected',
};

/** Events that can only follow a delivery. */
const AFTER_DELIVERY = new Set(['open', 'click', 'unsubscribe', 'spam']);

const MAX_REASON = 200;

/** A provider reason without any address in it, trimmed to MAX_REASON characters. */
export function redactReason(reason: string): string {
  const text = reason.replace(/[^\s<>()"',;:@]+@[^\s<>()"',;:@]+/g, '…').replace(/\s+/g, ' ').trim();
  return text.length > MAX_REASON ? `${text.slice(0, MAX_REASON - 1)}…` : text;
}

function eventName(row: EmailEventRow): string {
  return typeof row.event === 'string' ? row.event.trim().toLowerCase() : '';
}

/** Seconds since 1970 (Mailtrap's unit), or 0 when unknown. */
function eventSeconds(row: EmailEventRow): number {
  const t = typeof row.timestamp === 'string' ? Number(row.timestamp) : row.timestamp;
  return typeof t === 'number' && Number.isFinite(t) ? t : 0;
}

function reasonOf(row: EmailEventRow): string | undefined {
  const raw = [row.reason, row.bounce_category, row.response].find((v) => typeof v === 'string' && v.trim() !== '') as string | undefined;
  const text = raw ? redactReason(raw) : '';
  return text || undefined;
}

/** The lower-cased address of an event, or '' without one. */
export function eventAddress(row: EmailEventRow): string {
  return typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
}

/**
 * The status of one address from all its events. The latest delivery event decides (a soft bounce followed
 * by a delivery is delivered); without one, an open, click, unsubscribe or spam report implies the mail
 * arrived. A spam report turns a delivered mail into `spam`. Undefined when no event says anything.
 */
export function deliveryOf(rows: EmailEventRow[]): MailDelivery | undefined {
  let latest: EmailEventRow | undefined;
  let after: EmailEventRow | undefined;
  let spam = false;
  for (const row of rows) {
    const name = eventName(row);
    if (DELIVERY_EVENTS[name]) {
      if (!latest || eventSeconds(row) >= eventSeconds(latest)) latest = row;
    } else if (AFTER_DELIVERY.has(name)) {
      if (!after || eventSeconds(row) >= eventSeconds(after)) after = row;
      if (name === 'spam') spam = true;
    }
  }
  const source = latest ?? after;
  if (!source) return undefined;
  const base: MailDeliveryStatus = latest ? DELIVERY_EVENTS[eventName(latest)] : 'delivered';
  const status: MailDeliveryStatus = base === 'delivered' && spam ? 'spam' : base;
  const seconds = eventSeconds(source);
  const reason = status === 'rejected' || status === 'deferred' ? reasonOf(source) : undefined;
  return { status, ...(reason ? { reason } : {}), ...(seconds > 0 ? { at: new Date(seconds * 1000).toISOString() } : {}) };
}

/** The status per lower-cased address. */
export function deliveriesByAddress(rows: EmailEventRow[]): Map<string, MailDelivery> {
  const grouped = new Map<string, EmailEventRow[]>();
  for (const row of rows) {
    const address = eventAddress(row);
    if (!address) continue;
    grouped.set(address, [...(grouped.get(address) ?? []), row]);
  }
  const out = new Map<string, MailDelivery>();
  for (const [address, list] of grouped) {
    const delivery = deliveryOf(list);
    if (delivery) out.set(address, delivery);
  }
  return out;
}

export interface MailingDeliveriesResult {
  /** per E-Mail recipient with a known status; a recipient missing here is still on its way */
  recipients: ({ personKey: string } & MailDelivery)[];
  /** the Versand's own To/Cc addresses (already on the mailings doc), with a known status */
  addresses: ({ email: string } & MailDelivery)[];
  /** events for addresses that are neither a recipient's current address nor To/Cc (e.g. changed since) */
  unmatched: number;
}

/**
 * Joins the statuses to the recipients. `emailByKey` is each E-Mail recipient's address as the send read it
 * (address-directory); two persons sharing one address both get its status. `visible` are the addresses the
 * caller may see (To/Cc); every other address is only counted.
 */
export function joinDeliveries(byAddress: Map<string, MailDelivery>, emailByKey: Map<string, string>, visible: string[]): MailingDeliveriesResult {
  const used = new Set<string>();
  const recipients: MailingDeliveriesResult['recipients'] = [];
  for (const [personKey, email] of emailByKey) {
    const address = email.trim().toLowerCase();
    const delivery = byAddress.get(address);
    if (!delivery) continue;
    used.add(address);
    recipients.push({ personKey, ...delivery });
  }
  const addresses: MailingDeliveriesResult['addresses'] = [];
  for (const email of new Set(visible.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0))) {
    const delivery = byAddress.get(email);
    if (!delivery || used.has(email)) continue;
    used.add(email);
    addresses.push({ email, ...delivery });
  }
  const unmatched = [...byAddress.keys()].filter((address) => !used.has(address)).length;
  return { recipients, addresses, unmatched };
}
