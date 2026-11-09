// libs/content/pdf-template/util/src/lib/versand.util.ts
import { CalEventModel, DeliveryChannel } from '@okr/shared-models';
import { addDuration, convertDateFormatToString, DateFormat, MAILING_CHANNELS, MailingRecipientChannels } from '@okr/shared-util-core';

/**
 * The delivery types a Versand sends (spec 1.145): E-Mail, In-App (P2), and Post as a letter PDF the
 * sender downloads (P3).
 */
export const ACTIVE_MAILING_CHANNELS: DeliveryChannel[] = [DeliveryChannel.Email, DeliveryChannel.Chat, DeliveryChannel.Post];

/**
 * What a group admin may send: no Post, because the letters carry members' postal addresses, which the
 * address vault keeps from a group admin (spec 1.145 §6.1). The column is shown but cannot be ticked.
 */
export const GROUP_ADMIN_MAILING_CHANNELS: DeliveryChannel[] = [DeliveryChannel.Email, DeliveryChannel.Chat];

/** «Versand nur via E-Mail»: only the E-Mail column can be ticked, Post and In-App are off. */
export const EMAIL_ONLY_MAILING_CHANNELS: DeliveryChannel[] = [DeliveryChannel.Email];

/**
 * The ticks after «Versand nur via E-Mail» is switched: on, every Post and In-App tick goes; off, the ticks
 * kept from before come back beside the E-Mail ticks as they are now.
 */
export function emailOnlyDeliveries(deliveries: VersandDeliveries, emailOnly: boolean, before: VersandDeliveries = {}): VersandDeliveries {
  const out: VersandDeliveries = {};
  for (const key of new Set([...Object.keys(deliveries), ...Object.keys(before)])) {
    const email = (deliveries[key] ?? []).includes(DeliveryChannel.Email);
    const others = emailOnly ? [] : (before[key] ?? []).filter((c) => c !== DeliveryChannel.Email);
    out[key] = MAILING_CHANNELS.filter((c) => (c === DeliveryChannel.Email ? email : others.includes(c)));
  }
  return out;
}

/** Whether anybody is ticked under Post. */
export function hasPostDelivery(deliveries: VersandDeliveries): boolean {
  return Object.values(deliveries).some((d) => d.includes(DeliveryChannel.Post));
}

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
  active: DeliveryChannel[] = ACTIVE_MAILING_CHANNELS,
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
    deliveries[person.personKey] = (answer?.initial ?? fallback).filter((c) => active.includes(c));
  }
  return { rows, deliveries };
}

/** Whether a cell can be ticked: possible for that person and sendable today. */
export function isDeliveryEditable(row: VersandRow, channel: DeliveryChannel, active: DeliveryChannel[] = ACTIVE_MAILING_CHANNELS): boolean {
  return active.includes(channel) && row.possible.includes(channel);
}

/** Ticks or unticks one cell; a cell that is not editable is left as it is. */
export function toggleDelivery(
  deliveries: VersandDeliveries, row: VersandRow, channel: DeliveryChannel, active: DeliveryChannel[] = ACTIVE_MAILING_CHANNELS,
): VersandDeliveries {
  if (!isDeliveryEditable(row, channel, active)) return deliveries;
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
  /** the date (and time) as shown to the sender and in the mail, e.g. «01.12.2026, 19:30» */
  when: string;
  /**
   * The groups whose calendars the event sits in — only when it sits in group calendars ONLY. An event
   * that is also in a club (non-group) calendar reaches everyone, so it has no groups here.
   */
  groupKeys?: string[];
}

/** How far ahead a Versand offers events. */
export const VERSAND_EVENT_MONTHS = 6;

/**
 * «01.12.2026, 19:30» with a start time, «01.12.2026» without: the same text the answer block in the mail
 * shows (`eventWhen` in apps/functions/src/calendar/mail.ts), so the preview matches what is sent.
 */
export function versandEventWhen(startDate: string | undefined, startTime: string | undefined): string {
  if (!startDate) return '';
  const date = convertDateFormatToString(startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
  return startTime ? `${date}, ${startTime}` : date;
}

/**
 * The events a Versand can ask about, in the order given (the query sorts by date): from `today` up to
 * VERSAND_EVENT_MONTHS ahead, and only the ones `sendMailing` accepts — no personal event (no calendar:
 * same rule as isPersonalCalevent in @okr/calendar-calevent-util, not imported because that barrel
 * carries an Angular pipe), nothing archived, cancelled, locked or still a poll date (`proposed`).
 * Each carries the groups whose calendars it sits in (a calendar owned by `group.<key>`), but only when ALL
 * its calendars are group calendars: one club calendar among them means the event is open to everyone.
 */
export function versandEventsOf(
  calevents: CalEventModel[],
  calendars: { okey: string; owner?: string }[],
  today: string,
): VersandEvent[] {
  const until = addDuration(today, { months: VERSAND_EVENT_MONTHS });
  const groupOfCalendar = new Map(calendars
    .filter((c) => (c.owner ?? '').startsWith('group.'))
    .map((c) => [c.okey, (c.owner ?? '').slice('group.'.length)]));
  return calevents
    .filter((e) => (e.calendars?.length ?? 0) > 0)
    .filter((e) => !e.isArchived && !e.isLocked && e.state !== 'cancelled' && e.state !== 'proposed')
    .filter((e) => !!e.startDate && e.startDate >= today && e.startDate <= until)
    .map((e) => {
      const groups = (e.calendars ?? []).map((key) => groupOfCalendar.get(key));
      const groupKeys = groups.every((key) => !!key) ? [...new Set(groups as string[])] : [];
      return {
        caleventKey: e.okey,
        name: e.name,
        when: versandEventWhen(e.startDate, e.startTime),
        ...(groupKeys.length > 0 ? { groupKeys } : {}),
      };
    });
}

/**
 * Per chosen group-only event: how many of the E-Mail recipients are in none of its groups. They still get
 * the link and can answer, so this is a note, not a block. Events without groups (open to the club), and a
 * count of 0, give no entry.
 */
export function groupReachWarnings(
  events: VersandEvent[],
  emailKeys: string[],
  membersByGroup: Record<string, string[]>,
): { caleventKey: string; eventName: string; count: number }[] {
  const out: { caleventKey: string; eventName: string; count: number }[] = [];
  for (const event of events) {
    if (!event.groupKeys?.length) continue;
    const members = new Set(event.groupKeys.flatMap((key) => membersByGroup[key] ?? []));
    const count = emailKeys.filter((key) => !members.has(key)).length;
    if (count > 0) out.push({ caleventKey: event.caleventKey, eventName: event.name, count });
  }
  return out;
}

/** The attachments a letter cannot carry: everything that is not a PDF (spec 1.145 §6.1). */
export function nonPdfAttachmentNames(files: { filename: string; contentType?: string }[]): string[] {
  return files
    .filter((f) => f.filename && f.contentType !== 'application/pdf' && !f.filename.toLowerCase().endsWith('.pdf'))
    .map((f) => f.filename);
}
