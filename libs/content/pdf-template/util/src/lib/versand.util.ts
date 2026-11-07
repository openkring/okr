// libs/content/pdf-template/util/src/lib/versand.util.ts
import { DeliveryChannel } from '@okr/shared-models';
import { MAILING_CHANNELS, MailingRecipientChannels } from '@okr/shared-util-core';

/**
 * The delivery types a Versand can actually send today: E-Mail, and In-App since P2 (spec 1.145 §10).
 * Post follows with P3 (the letter PDF); until then its column is shown but cannot be ticked (§3.1),
 * so the table never promises a delivery that does not happen.
 */
export const ACTIVE_MAILING_CHANNELS: DeliveryChannel[] = [DeliveryChannel.Email, DeliveryChannel.Chat];

/** What `sendMailing` gets per recipient: the ticked delivery types, persons without a tick left out. */
export function versandDeliveries(rows: VersandRow[], deliveries: VersandDeliveries): { personKey: string; channels: DeliveryChannel[] }[] {
  return rows
    .map((row) => ({ personKey: row.personKey, channels: deliveries[row.personKey] ?? [] }))
    .filter((d) => d.channels.length > 0);
}

/** One row of the Zustellung table: who, their email (empty when none), and what is possible. */
export interface VersandRow {
  personKey: string;
  name: string;
  email: string;
  possible: DeliveryChannel[];
}

/** personKey → the delivery types ticked for this Versand. */
export type VersandDeliveries = Record<string, DeliveryChannel[]>;

/**
 * Joins the persons with the server's answer. A person the server did not answer for (a group admin
 * asked about a non-member, or the call failed) can only be emailed, and only with an address.
 */
export function buildVersandRows(
  persons: { personKey: string; name: string; email: string }[],
  channels: MailingRecipientChannels[] | undefined,
): { rows: VersandRow[]; deliveries: VersandDeliveries } {
  const byKey = new Map((channels ?? []).map((c) => [c.personKey, c]));
  const rows: VersandRow[] = [];
  const deliveries: VersandDeliveries = {};
  for (const person of persons) {
    const answer = byKey.get(person.personKey);
    if (channels && !answer) continue;            // the server refused this person
    const fallback = person.email ? [DeliveryChannel.Email] : [];
    const possible = answer?.possible ?? fallback;
    rows.push({ ...person, possible });
    deliveries[person.personKey] = (answer?.initial ?? fallback).filter((c) => ACTIVE_MAILING_CHANNELS.includes(c));
  }
  return { rows, deliveries };
}

/** Whether a cell can be ticked: possible for that person and sendable today. */
export function isDeliveryEditable(row: VersandRow, channel: DeliveryChannel): boolean {
  return ACTIVE_MAILING_CHANNELS.includes(channel) && row.possible.includes(channel);
}

/** Ticks or unticks one cell; a cell that is not editable is left as it is. */
export function toggleDelivery(deliveries: VersandDeliveries, row: VersandRow, channel: DeliveryChannel): VersandDeliveries {
  if (!isDeliveryEditable(row, channel)) return deliveries;
  const current = deliveries[row.personKey] ?? [];
  const next = current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel];
  return { ...deliveries, [row.personKey]: MAILING_CHANNELS.filter((c) => next.includes(c)) };
}

/** Ticks per delivery type, in column order. */
export function deliveryTotals(deliveries: VersandDeliveries): Record<DeliveryChannel, number> {
  const totals = { [DeliveryChannel.Post]: 0, [DeliveryChannel.Email]: 0, [DeliveryChannel.Chat]: 0 };
  for (const ticked of Object.values(deliveries)) for (const channel of ticked) totals[channel]++;
  return totals;
}

/** Persons this Versand does not reach: no tick at all. */
export function unreachableCount(rows: VersandRow[], deliveries: VersandDeliveries): number {
  return rows.filter((row) => (deliveries[row.personKey] ?? []).length === 0).length;
}

/** The Bcc of the email part: every address ticked under E-Mail, each once, in row order. */
export function versandBcc(rows: VersandRow[], deliveries: VersandDeliveries): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (!row.email || !(deliveries[row.personKey] ?? []).includes(DeliveryChannel.Email)) continue;
    const key = row.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.email);
  }
  return out;
}

/** An event a Versand can attach: its personal answer link goes into every mail. */
export interface VersandEvent {
  caleventKey: string;
  name: string;
  /** the date (and time) as shown to the sender and in the mail, e.g. «01.12.2026 19:30» */
  when: string;
  /** the group whose calendar the event sits in, if any */
  groupKey?: string;
}

/**
 * Per chosen event of a group: how many of the E-Mail recipients are not in that group. They still get
 * the link and can answer, so this is a note, not a block. Events without a group, and a count of 0,
 * give no entry.
 */
export function groupReachWarnings(
  events: VersandEvent[],
  emailKeys: string[],
  membersByGroup: Record<string, string[]>,
): { eventName: string; count: number }[] {
  const out: { eventName: string; count: number }[] = [];
  for (const event of events) {
    if (!event.groupKey) continue;
    const members = new Set(membersByGroup[event.groupKey] ?? []);
    const count = emailKeys.filter((key) => !members.has(key)).length;
    if (count > 0) out.push({ eventName: event.name, count });
  }
  return out;
}
