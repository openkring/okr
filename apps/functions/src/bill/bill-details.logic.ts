/**
 * Pure rules for editing a BOOKED bill (spec 1.92 §3): which fields change, what is mirrored onto the
 * `bill-{key}` booking and its lines, and when the edit is refused. No Firestore access. Only values
 * that differ from the stored ones count as a change, so a client may resend the whole form.
 */
import type { BillModel } from '@okr/shared-models';
import { getBillIndex, newBill } from '@okr/finance-bill-util';

import type { BillLineInput } from './bill.logic';

const MAX_BOOKING_TITLE_LENGTH = 200;

/** The cleaned request: every field optional; `lines` positional, one entry per stored line. */
export interface BillDetailsInput {
  title?: string;
  notes?: string;
  dueDate?: string;
  paymentReference?: string;
  creditorIban?: string;
  lines?: { title?: string; costCenterKey?: string; projectKey?: string }[];
}

/** What the plan needs to know about the stored bill (a raw Firestore doc fits). */
export interface BillDetailsBill {
  state?: string;
  billId?: string;
  title?: string;
  notes?: string;
  dueDate?: string;
  paymentReference?: string;
  creditorIban?: string;
  lines?: BillLineInput[];
  [key: string]: unknown;
}

export interface BillDetailsContext {
  /** the bill carries its own `bill-{key}` booking */
  hasBooking: boolean;
  /** date and number of that booking (for its search index) */
  bookingDate: string;
  bookingNo: number;
}

export type BillDetailsRefusal = 'not-booked' | 'bill-paid' | 'no-lines' | 'line-count';

export interface BillLinePatch {
  index: number;
  patch: { title?: string; costCenterKey?: string; projectKey?: string };
}

export type BillDetailsPlan =
  | { refusal: BillDetailsRefusal }
  | {
    refusal?: undefined;
    billPatch: Record<string, unknown>;
    bookingPatch?: { title: string; index: string };
    linePatches: BillLinePatch[];
    /** true when the booking or one of its lines changes → the booking's period must be open */
    touchesLedger: boolean;
  };

/** `Kreditor {billId} {title}`, at most 200 characters (the title bookBill writes). */
export function billBookingTitle(billId: string, title: string): string {
  return `Kreditor ${[billId, title].filter((s) => !!s).join(' ')}`.slice(0, MAX_BOOKING_TITLE_LENGTH);
}

/** The journal search index of a bill booking (as bookBill writes it). */
export function billBookingIndex(date: string, bookingNo: number, title: string): string {
  return `d:${date} no:${bookingNo} n:${title}`;
}

/** Decides the bill patch, the booking patch, the per-line patches and whether the ledger is touched. */
export function planBillDetailsUpdate(bill: BillDetailsBill, input: BillDetailsInput, ctx: BillDetailsContext): BillDetailsPlan {
  if (bill.state === 'draft') return { refusal: 'not-booked' };

  const storedLines = bill.lines ?? [];
  if (input.lines !== undefined) {
    if (storedLines.length === 0) return { refusal: 'no-lines' };
    if (input.lines.length !== storedLines.length) return { refusal: 'line-count' };
  }

  const stored = (v: string | undefined): string => v ?? '';
  const billPatch: Record<string, unknown> = {};
  const changed = (field: 'title' | 'notes' | 'dueDate' | 'paymentReference' | 'creditorIban'): boolean =>
    input[field] !== undefined && input[field] !== stored(bill[field]);

  for (const field of ['dueDate', 'paymentReference', 'creditorIban'] as const) {
    if (!changed(field)) continue;
    if (bill.state === 'paid') return { refusal: 'bill-paid' };
    billPatch[field] = input[field];
  }
  // only bexio-migrated bills are stored as 'overdue', and isOverdueBill trusts that regardless of the date;
  // a new due date resets it to 'todo' so the display-time derivation decides again
  if (billPatch['dueDate'] !== undefined && bill.state === 'overdue') billPatch['state'] = 'todo';
  for (const field of ['title', 'notes'] as const) {
    if (changed(field)) billPatch[field] = input[field];
  }

  const linePatches: BillLinePatch[] = [];
  const newLines: BillLineInput[] = storedLines.map((l) => ({ ...l }));
  (input.lines ?? []).forEach((incoming, index) => {
    const current = storedLines[index];
    const patch: BillLinePatch['patch'] = {};
    if (incoming.title !== undefined && incoming.title !== stored(current.title)) patch.title = incoming.title;
    if (incoming.costCenterKey !== undefined && incoming.costCenterKey !== stored(current.costCenterKey)) patch.costCenterKey = incoming.costCenterKey;
    if (incoming.projectKey !== undefined && incoming.projectKey !== stored(current.projectKey)) patch.projectKey = incoming.projectKey;
    if (Object.keys(patch).length === 0) return;
    linePatches.push({ index, patch });
    Object.assign(newLines[index], patch);
  });
  if (linePatches.length > 0) billPatch['lines'] = newLines;

  if (billPatch['title'] !== undefined) {
    billPatch['index'] = getBillIndex(Object.assign(newBill(''), bill, { title: billPatch['title'] }) as BillModel);
  }

  const bookingTitleChanged = billPatch['title'] !== undefined;
  const bookingPatch = ctx.hasBooking && bookingTitleChanged
    ? (() => {
      const title = billBookingTitle(stored(bill.billId), billPatch['title'] as string);
      return { title, index: billBookingIndex(ctx.bookingDate, ctx.bookingNo, title) };
    })()
    : undefined;

  return {
    billPatch,
    ...(bookingPatch ? { bookingPatch } : {}),
    linePatches,
    touchesLedger: ctx.hasBooking && (!!bookingPatch || linePatches.length > 0),
  };
}
