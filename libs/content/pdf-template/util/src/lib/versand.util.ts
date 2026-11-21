// libs/content/pdf-template/util/src/lib/versand.util.ts
import { CalEventModel, DeliveryChannel, HouseholdBundle } from '@okr/shared-models';
import {
  addDuration, convertDateFormatToString, DateFormat, householdRecipientKey, MAILING_CHANNELS, MailingHousehold, MailingRecipientChannels,
} from '@okr/shared-util-core';

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

/**
 * One row of the Zustellung table: who, their email (empty when none), and what is possible. A household
 * row (spec 1.168 §6.2) has `personKey` `household.<okey>`, the household name, the contact's name and
 * the members it stands for.
 */
export interface VersandRow {
  personKey: string;
  name: string;
  email: string;
  possible: DeliveryChannel[];
  /** set only on a household row: the contact who receives it */
  contactName?: string;
  /** set only on a household row: the members it is delivered for */
  members?: { personKey: string; name: string }[];
}

/** The Versand channel of each household bundle switch. */
export const HOUSEHOLD_BUNDLE_CHANNELS: Record<keyof HouseholdBundle, DeliveryChannel> = {
  post: DeliveryChannel.Post,
  email: DeliveryChannel.Email,
  inApp: DeliveryChannel.Chat,
};

/**
 * Combines household members into one household row (spec 1.168 §6.1). Per household not in `split` and per
 * bundled channel: the members ticked on that channel lose it and the household row gets it — but only if the
 * contact can be reached on it; otherwise that channel stays per member. The household row comes before its
 * first member; members left without any tick stay listed (they are covered by the household row). The
 * household row can only carry the channels it took over.
 *
 * `hasAnswers`: the Versand carries events with answer links (or QR codes on the letters). An answer through a
 * household is recorded for its contact only, so until that is decided nothing is combined and every member gets
 * their own letter / mail (controller ruling 15); the rows and ticks come back unchanged.
 */
export function applyHouseholds(
  rows: VersandRow[],
  deliveries: VersandDeliveries,
  households: MailingHousehold[],
  split: ReadonlySet<string>,
  opts: { hasAnswers?: boolean } = {},
): { rows: VersandRow[]; deliveries: VersandDeliveries } {
  if (opts.hasAnswers === true) return { rows, deliveries };
  let outRows = rows;
  let out = deliveries;
  for (const household of households) {
    if (split.has(household.okey)) continue;
    const members = new Set(household.memberKeys);
    const memberRows = outRows.filter((row) => members.has(row.personKey));
    if (memberRows.length === 0) continue;
    const combined: DeliveryChannel[] = [];
    const next: VersandDeliveries = { ...out };
    for (const [bundleKey, channel] of Object.entries(HOUSEHOLD_BUNDLE_CHANNELS) as [keyof HouseholdBundle, DeliveryChannel][]) {
      if (!household.bundle[bundleKey] || !household.contact.possible.includes(channel)) continue;
      const ticked = memberRows.filter((row) => (next[row.personKey] ?? []).includes(channel));
      if (ticked.length === 0) continue;
      for (const row of ticked) next[row.personKey] = next[row.personKey].filter((c) => c !== channel);
      combined.push(channel);
    }
    if (combined.length === 0) continue;
    const key = householdRecipientKey(household.okey);
    const channels = MAILING_CHANNELS.filter((c) => combined.includes(c));
    next[key] = channels;
    const householdRow: VersandRow = {
      personKey: key,
      name: household.name,
      email: rows.find((row) => row.personKey === household.contactKey)?.email ?? '',
      possible: channels,
      contactName: household.contactName,
      members: memberRows.map((row) => ({ personKey: row.personKey, name: row.name })),
    };
    const at = outRows.indexOf(memberRows[0]);
    outRows = [...outRows.slice(0, at), householdRow, ...outRows.slice(at)];
    out = next;
  }
  return { rows: outRows, deliveries: out };
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

/**
 * Persons this Versand does not reach: no tick at all. A household row is never counted, and a member counts
 * only when the household row standing for it has no tick either.
 */
export function unreachableCount(rows: VersandRow[], deliveries: VersandDeliveries): number {
  const covered = new Set(rows
    .filter((row) => row.members && (deliveries[row.personKey] ?? []).length > 0)
    .flatMap((row) => (row.members ?? []).map((m) => m.personKey)));
  return rows.filter((row) => !row.members && !covered.has(row.personKey) && (deliveries[row.personKey] ?? []).length === 0).length;
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

/**
 * Removes one address from the Bcc by unticking E-Mail for every person who has it (case-insensitive):
 * the Bcc follows the Zustellung, so the table changes and the Bcc with it. Returns the same object when
 * nobody had it ticked.
 */
export function untickEmailAddress(rows: VersandRow[], deliveries: VersandDeliveries, address: string): VersandDeliveries {
  const key = address.trim().toLowerCase();
  let next = deliveries;
  for (const row of rows) {
    const ticked = deliveries[row.personKey] ?? [];
    if (row.email.toLowerCase() !== key || !ticked.includes(DeliveryChannel.Email)) continue;
    if (next === deliveries) next = { ...deliveries };
    next[row.personKey] = ticked.filter((c) => c !== DeliveryChannel.Email);
  }
  return next;
}

/**
 * How many E-Mail ticks share their address with an earlier one: the E-Mail column counts persons, the Bcc
 * addresses, and an address two persons share (a couple, a family) goes out once.
 */
export function sharedEmailCount(rows: VersandRow[], deliveries: VersandDeliveries): number {
  const ticked = rows.filter((row) => !!row.email && (deliveries[row.personKey] ?? []).includes(DeliveryChannel.Email)).length;
  return ticked - versandBcc(rows, deliveries).length;
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
