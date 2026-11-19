/**
 * The draft-bill writer shared by `writeBill` and the trainer-billing callables (spec 1.167): validation
 * of the header, the lines → total / accounts rules, and the one `tx.set`. No role check, no request
 * parsing — the caller has authorised the write and cleaned the lines (`cleanBillLines`).
 */
import type { Firestore, Transaction } from 'firebase-admin/firestore';

import { AvatarInfo, BillCollection, BillModel } from '@okr/shared-models';
import { getBillIndex } from '@okr/finance-bill-util';
import { normalizeQrReference, removeKeyFromOkrModel } from '@okr/shared-util-core';

import { withoutUndefined } from '../invoice/invoice.logic';
import { billTotal, CleanBillLine } from './bill.logic';

const MAX_ID_LENGTH = 50;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;
const MAX_IBAN_LENGTH = 34;

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export interface DraftBillInput {
  billKey: string;
  tenantId: string;
  accountingTenantId: string;
  /** A field left `undefined` keeps the stored value (update) or the model default (create); `vendor: null` clears it. */
  header: {
    billId?: string; title?: string; billDate?: string; dueDate?: string; vendor?: AvatarInfo | null;
    notes?: string; paymentReference?: string; creditorIban?: string;
  };
  lines: CleanBillLine[];
  /** `undefined` keeps the stored attachments */
  attachments?: string[];
  /** `undefined` keeps the stored link to a trainer invoice */
  trainerInvoiceKey?: string;
}

/** The draft bill as it is stored: state draft, no bookings or payments, total = Σ lines. Pure. */
export function buildDraftBill(input: DraftBillInput, existing?: Record<string, unknown>): BillModel {
  const h = input.header;
  const bill = new BillModel(input.tenantId);
  if (existing) Object.assign(bill, existing);
  bill.tenants = (existing?.['tenants'] as string[] | undefined) ?? [input.tenantId];
  bill.accountingTenantId = input.accountingTenantId;
  if (h.billId !== undefined) bill.billId = text(h.billId, MAX_ID_LENGTH);
  if (h.title !== undefined) bill.title = text(h.title, MAX_TITLE_LENGTH);
  if (h.billDate !== undefined) bill.billDate = h.billDate;
  if (h.dueDate !== undefined) bill.dueDate = h.dueDate;
  if (h.vendor !== undefined) bill.vendor = h.vendor ?? undefined;
  if (h.notes !== undefined) bill.notes = h.notes.slice(0, MAX_NOTES_LENGTH);
  if (h.paymentReference !== undefined) bill.paymentReference = normalizeQrReference(text(h.paymentReference, 40));
  if (h.creditorIban !== undefined) bill.creditorIban = text(h.creditorIban, MAX_IBAN_LENGTH).replace(/\s+/g, '').toUpperCase();
  if (input.attachments !== undefined) bill.attachments = input.attachments;
  if (input.trainerInvoiceKey !== undefined) bill.trainerInvoiceKey = input.trainerInvoiceKey;
  bill.state = 'draft';
  bill.lines = input.lines;
  bill.bookingKeys = [];
  bill.payments = [];
  bill.paymentDate = '';
  bill.bookingAccount = [...new Set(input.lines.map((l) => l.accountKey).filter((k) => !!k))].join(',');
  bill.totalAmount = { amount: billTotal(input.lines), currency: 'CHF', periodicity: 'one-time' };
  bill.index = getBillIndex(bill);
  return bill;
}

/**
 * Writes the draft inside the caller's transaction. Performs no reads (Firestore needs every read before
 * the first write), so the caller reads first and passes the stored document as `existing` when it updates.
 */
export function writeDraftBillTx(tx: Transaction, db: Firestore, input: DraftBillInput, existing?: Record<string, unknown>): void {
  const bill = buildDraftBill(input, existing);
  tx.set(db.collection(BillCollection).doc(input.billKey), withoutUndefined(removeKeyFromOkrModel(bill)));
}
