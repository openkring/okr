import { AvatarInfo, BillModel, BookingModel, ExpenseModel, InvoiceModel } from '@okr/shared-models';

/**
 * Accounting overview «Seit deinem letzten Besuch»: what was created in these books since the treasurer's
 * previous visit. Bookings, bills and invoices carry a server-stamped `createdAt`, expenses `creationDateTime`
 * (both StoreDateTime, Swiss local time); payments are found through their booking. Amounts in Rappen.
 */

/** Visits closer together than this count as one: coming back from a list keeps the same baseline. */
export const VISIT_WINDOW_MS = 30 * 60 * 1000;
/** No previous visit on this device: show the last week. */
export const FIRST_VISIT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Stored per device, user and books (localStorage). `since` = the baseline shown, `seenAt` = the last visit. */
export interface VisitMarks {
  since: number;
  seenAt: number;
}

/** The marks after a visit at `now`: a new baseline only when the previous visit is older than the window. */
export function nextVisit(stored: VisitMarks | undefined, now: number): VisitMarks & { isFirst: boolean } {
  if (!stored || !Number.isFinite(stored.since) || !Number.isFinite(stored.seenAt)) {
    return { since: now - FIRST_VISIT_LOOKBACK_MS, seenAt: now, isFirst: true };
  }
  const since = now - stored.seenAt < VISIT_WINDOW_MS ? stored.since : stored.seenAt;
  return { since, seenAt: now, isFirst: false };
}

/** StoreDateTime (yyyyMMddHHmmss) in the device's local time, comparable with the stamped fields. */
export function storeDateTimeOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export interface NewsItem {
  key: string;
  label: string;
  /** Rappen; negative = money going out. undefined = not shown (bookings carry no amount on the header) */
  amount: number | undefined;
  /** StoreDateTime of creation, newest first */
  createdAt: string;
}

export interface AccountingNews {
  bookings: NewsItem[];
  payments: NewsItem[];
  bills: NewsItem[];
  invoices: NewsItem[];
  expenses: NewsItem[];
}

/** A source is undefined when its read failed; its list stays undefined (the card shows «—»). */
export interface NewsInput {
  since: string;
  bookings: BookingModel[] | undefined;
  bills: BillModel[] | undefined;
  invoices: InvoiceModel[] | undefined;
  expenses: ExpenseModel[] | undefined;
}

export type NewsLists = { [K in keyof AccountingNews]: NewsItem[] | undefined };

function partyName(p: AvatarInfo | undefined): string {
  if (!p) return '';
  return [p.name1, p.name2].filter(s => !!s?.trim()).join(' ').trim() || p.label || '';
}

function joinLabel(...parts: (string | undefined)[]): string {
  return parts.map(s => (s ?? '').trim()).filter(s => s.length > 0).join(' · ');
}

const isNew = (createdAt: string | undefined, since: string): createdAt is string => !!createdAt && createdAt >= since;
const newestFirst = (a: NewsItem, b: NewsItem) => b.createdAt.localeCompare(a.createdAt);

export function summarizeNews(input: NewsInput): NewsLists {
  const { since } = input;
  const bookings = input.bookings?.filter(b => isNew(b.createdAt, since));
  const createdByBooking = new Map((bookings ?? []).map(b => [b.okey, b.createdAt]));

  const payments = input.bills === undefined && input.invoices === undefined || bookings === undefined ? undefined : [
    ...(input.invoices ?? []).flatMap(i => (i.payments ?? [])
      .filter(p => createdByBooking.has(p.bookingKey))
      .map(p => ({ key: `${i.okey}-${p.bookingKey}`, label: joinLabel(partyName(i.receiver), i.invoiceId || i.title), amount: p.amount, createdAt: createdByBooking.get(p.bookingKey) ?? '' }))),
    ...(input.bills ?? []).flatMap(b => (b.payments ?? [])
      .filter(p => !!p.bookingKey && createdByBooking.has(p.bookingKey))
      .map(p => ({ key: `${b.okey}-${p.bookingKey}`, label: joinLabel(partyName(b.vendor), b.billId || b.title), amount: -p.amount, createdAt: createdByBooking.get(p.bookingKey ?? '') ?? '' }))),
  ].sort(newestFirst);

  return {
    bookings: bookings?.map(b => ({ key: b.okey, label: joinLabel(b.bookingNo ? `#${b.bookingNo}` : '', b.title), amount: undefined, createdAt: b.createdAt })).sort(newestFirst),
    payments,
    bills: input.bills?.filter(b => isNew(b.createdAt, since))
      .map(b => ({ key: b.okey, label: joinLabel(partyName(b.vendor), b.title), amount: b.totalAmount?.amount, createdAt: b.createdAt })).sort(newestFirst),
    invoices: input.invoices?.filter(i => isNew(i.createdAt, since))
      .map(i => ({ key: i.okey, label: joinLabel(partyName(i.receiver), i.title), amount: i.totalAmount?.amount, createdAt: i.createdAt })).sort(newestFirst),
    // a draft expense was not submitted yet
    expenses: input.expenses?.filter(e => e.status !== 'draft' && isNew(e.creationDateTime, since))
      .map(e => ({ key: e.okey, label: joinLabel(e.userName, e.abstract), amount: e.amountTotal ?? 0, createdAt: e.creationDateTime })).sort(newestFirst),
  };
}
