// libs/content/pdf-template/util/src/lib/versand.util.ts
import { DeliveryChannel } from '@okr/shared-models';
import { MAILING_CHANNELS, MailingRecipientChannels } from '@okr/shared-util-core';

/**
 * The delivery types a Versand can actually send today. In-App and Post follow with spec 1.144 P2/P3;
 * until then their columns are shown but cannot be ticked (§3.1), so the table never promises a
 * delivery that does not happen.
 */
export const ACTIVE_MAILING_CHANNELS: DeliveryChannel[] = [DeliveryChannel.Email];

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
