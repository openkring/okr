import { BillModel } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

import { BillI18n } from './bill-i18n';

export function newBill(tenantId: string): BillModel {
  return new BillModel(tenantId);
}

export function getBillIndex(bill: BillModel): string {
  let index = '';
  index = addIndexElement(index, 'i', bill.billId);
  if (bill.totalAmount) {
    index = addIndexElement(index, 'a', (bill.totalAmount.amount / 100).toFixed(2));
  }
  if (bill.vendor) {
    index = addIndexElement(index, 'n', bill.vendor.label || bill.vendor.name1 || '');
  }
  index = addIndexElement(index, 't', bill.title);
  return index;
}

export function getBillExportData(bills: BillModel[]): string[][] {
  const headers = ['okey', 'billId', 'title', 'billDate', 'dueDate', 'amount', 'currency', 'state', 'paymentDate', 'vendor'];
  const rows = bills.map(bill => [
    bill.okey ?? '',
    bill.billId,
    bill.title,
    bill.billDate,
    bill.dueDate,
    bill.totalAmount ? (bill.totalAmount.amount / 100).toFixed(2) : '',
    bill.totalAmount?.currency ?? '',
    bill.state,
    bill.paymentDate,
    bill.vendor ? (bill.vendor.label || bill.vendor.name1 || '') : '',
  ]);
  return [headers, ...rows];
}

/**
 * A bill that is still to pay (`todo`) past its due date, or one bexio already marks overdue.
 * @param today StoreDate (yyyyMMdd); the due date itself is not overdue yet
 */
export function isOverdueBill(bill: BillModel, today: string): boolean {
  if (bill.state === 'overdue') return true;
  const dueDate = bill.dueDate ?? '';
  return bill.state === 'todo' && dueDate.length > 0 && dueDate < today;
}

/** The state to show and filter on: `overdue` for an overdue bill, otherwise the stored state. */
export function billDisplayState(bill: BillModel, today: string): string {
  return isOverdueBill(bill, today) ? 'overdue' : bill.state;
}

/**
 * The booking accounts of a bill as account okeys. A bill has no booking of its own: bexio hands
 * over only the accounts it was booked on, stored comma-separated in `bookingAccount`.
 */
export function billAccountKeys(bill: BillModel): string[] {
  const keys = (bill.bookingAccount ?? '').split(',').map(k => k.trim()).filter(k => k.length > 0);
  return [...new Set(keys)];
}

/** The chip color of a bill state (as {@link billDisplayState} returns it). */
export function billStateColor(state: string): string {
  switch (state) {
    case 'paid': return 'success';
    case 'overdue': return 'danger';
    case 'draft': return 'warning';
    case 'todo': return 'primary';
  }
  return '';
}

/** The label of a bill state; an unknown state shows itself. */
export function billStateLabel(state: string, i18n: BillI18n): string {
  switch (state) {
    case 'draft': return i18n.state_draft();
    case 'todo': return i18n.state_todo();
    case 'paid': return i18n.state_paid();
    case 'overdue': return i18n.state_overdue();
  }
  return state;
}

/** The bookings of a bill in ledger order: its own bookings (one per bill line), then the payments; [] while not linked. */
export function billBookingKeys(bill: BillModel): string[] {
  // legacy bills lack the fields (Firestore reads skip model defaults)
  const keys = [...(bill.bookingKeys ?? []), ...(bill.payments ?? []).map(p => p.bookingKey ?? '')];
  return [...new Set(keys.filter(k => k.length > 0))];
}

/**
 * The bill's own share of each payment booking (bookingKey → Rappen). A collective bank payment
 * settles several bills in one booking; its ledger row shows this bill's amount, not the booking total.
 */
export function billBookingAmounts(bill: BillModel): Record<string, number> {
  const amounts: Record<string, number> = {};
  for (const p of bill.payments ?? []) {
    if (p.bookingKey) amounts[p.bookingKey] = (amounts[p.bookingKey] ?? 0) + (p.amount ?? 0);
  }
  return amounts;
}

/**
 * The finance-documents (Belege) of a bill: bexio-synced ones (`bexio-file-…`) and the one uploaded via
 * «Rechnung hochladen» (`bill-{billKey}`). Legacy bills hold raw bexio uuids, which are not files here.
 */
export function billVoucherKeys(bill: BillModel | undefined): string[] {
  return (bill?.attachments ?? []).filter(a => a.startsWith('bexio-file-') || a.startsWith('bill-'));
}
