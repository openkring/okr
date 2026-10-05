import { InvoiceModel } from '@okr/shared-models';

import { InvoiceI18n } from './invoice-i18n';
import { isPayableState } from './invoice-payment.util';

/**
 * An open invoice (pending, partial, unpaid) whose due date has passed, or one bexio already marks
 * overdue. Computed, never stored: native invoices stay `pending` until they are paid.
 * @param today StoreDate (yyyyMMdd); the due date itself is not overdue yet
 */
export function isOverdueInvoice(invoice: InvoiceModel, today: string): boolean {
  if (invoice.state === 'overdue') return true;
  const dueDate = invoice.dueDate ?? '';
  return isPayableState(invoice.state) && dueDate.length > 0 && dueDate < today;
}

/** The state to show and filter on: `overdue` for an overdue invoice, otherwise the stored state. */
export function invoiceDisplayState(invoice: InvoiceModel, today: string): string {
  return isOverdueInvoice(invoice, today) ? 'overdue' : invoice.state;
}

/**
 * Every booking of an invoice in ledger order: the issue booking (native) or the bexio bookings of a
 * migrated invoice (one per line), the payments (posted or linked), each reminder fee and its waiver,
 * and the storno of a cancelled invoice (spec 1.76). The storno key is derived — the invoice does not
 * store it; a missing booking is simply not found.
 */
export function invoiceBookingKeys(invoice: InvoiceModel): string[] {
  const keys = [invoice.bookingKey, ...(invoice.bookingKeys ?? [])];
  // legacy invoices lack the arrays (Firestore reads skip model defaults)
  for (const p of invoice.payments ?? []) keys.push(p.bookingKey);
  for (const r of invoice.reminders ?? []) keys.push(r.bookingKey, r.waiveBookingKey);
  if (invoice.state === 'cancelled' && invoice.bookingKey.startsWith('invoice-')) keys.push(`${invoice.bookingKey}-storno`);
  return [...new Set(keys.filter(k => !!k))];
}

/** The chip color of an invoice state (as {@link invoiceDisplayState} returns it). */
export function invoiceStateColor(state: string): string {
  switch (state) {
    case 'paid': return 'success';
    case 'overdue': return 'danger';
    case 'pending': return 'warning';
    case 'issuing': return 'warning';
    case 'draft': return 'medium';
    case 'cancelled': return 'medium';
  }
  return '';
}

/** The label of an invoice state; `issuing` reads as open, an unknown state shows itself. */
export function invoiceStateLabel(state: string, i18n: InvoiceI18n): string {
  switch (state) {
    case 'draft': return i18n.state_draft();
    case 'pending': return i18n.state_pending();
    case 'issuing': return i18n.state_pending();
    case 'paid': return i18n.state_paid();
    case 'overdue': return i18n.state_overdue();
    case 'cancelled': return i18n.state_cancelled();
  }
  return state;
}

/**
 * The accounts known for an invoice without bookings (bexio/migrated): the bank accounts its
 * payments went to. Such an invoice has no positions and no booking reference — the synced bexio
 * journal rows carry only the invoice title, which is not unique enough to match on.
 */
export function invoiceAccountKeys(invoice: InvoiceModel): string[] {
  const keys = (invoice.payments ?? []).map(p => p.bankAccountKey);
  return [...new Set(keys.filter(k => !!k))];
}
