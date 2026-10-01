import { InvoiceModel } from '@okr/shared-models';
import { addDuration, addIndexElement, getFullName } from '@okr/shared-util-core';

export function newInvoice(tenantId: string): InvoiceModel {
  return new InvoiceModel(tenantId);
}

/**
 * A new native draft (spec 1.76) of the given books: dated `today`, due after INVOICE_PAYMENT_DAYS,
 * without receiver and positions yet. The number is assigned when it is issued.
 */
export function newDraftInvoice(tenantId: string, accountingTenantId: string, today: string): InvoiceModel {
  const invoice = new InvoiceModel(tenantId);
  invoice.accountingTenantId = accountingTenantId;
  invoice.state = 'draft';
  invoice.invoiceDate = today;
  invoice.dueDate = addDuration(today, { days: INVOICE_PAYMENT_DAYS });
  return invoice;
}

/** Payment term of a new native invoice, in days. */
export const INVOICE_PAYMENT_DAYS = 30;

/** The member a native invoice is addressed to — the subset of MembershipModel it needs. */
export interface InvoiceMember { memberKey: string; memberName1: string; memberName2: string; memberModelType: 'person' | 'org' | 'group'; }

/**
 * A new native invoice to a member of the own books (spec 1.68: no bexio after the cut-over).
 * Dated `today`, due after INVOICE_PAYMENT_DAYS; the number is assigned when it is issued.
 */
export function newMemberInvoice(tenantId: string, accountingTenantId: string, member: InvoiceMember, today: string): InvoiceModel {
  const invoice = newDraftInvoice(tenantId, accountingTenantId, today);
  invoice.receiver = {
    key: member.memberKey, name1: member.memberName1, name2: member.memberName2,
    modelType: member.memberModelType, type: '', subType: '',
    label: getFullName(member.memberName1, member.memberName2),
  };
  return invoice;
}

/** Stamps the sequential number (and the visible Rechnungsnummer when empty); an already numbered invoice keeps its own. */
export function withInvoiceNo(invoice: InvoiceModel, invoiceNo: number): InvoiceModel {
  if (invoice.invoiceNo > 0) return invoice;
  return { ...invoice, invoiceNo, invoiceId: invoice.invoiceId || String(invoiceNo) };
}

export function getInvoiceIndex(invoice: InvoiceModel): string {
  let index = '';
  index = addIndexElement(index, 'i', invoice.invoiceId);
  if (invoice.totalAmount) {
    index = addIndexElement(index, 'a', (invoice.totalAmount.amount / 100).toFixed(2));
  }
  if (invoice.receiver) {
    index = addIndexElement(index, 'n', invoice.receiver.label || getFullName(invoice.receiver.name1, invoice.receiver.name2));
  }
  index = addIndexElement(index, 't', invoice.title);
  return index;
}

/**
 * Compute the next `invoiceNo` for one (accountingTenantId, fiscal year) sequence, given the
 * `invoiceNo`s already used by that tenant. `invoiceNo` encodes the year in its leading digits
 * (`year * 100000 + n`), so filtering by `Math.floor(no / 100000) === year` isolates this year's
 * numbers before taking the max.
 *
 * This is the ONE allocator for invoice numbers — both `InvoiceService.nextInvoiceNo` (client,
 * Angular) and the `postMemberFees` Cloud Function (admin SDK) call this pure function after
 * fetching the existing `invoiceNo`s their own way, so there is never a second, independent
 * sequence that could hand out a duplicate number.
 */
export function getNextInvoiceNo(invoiceNos: number[], year: number): number {
  const maxNo = invoiceNos
    .filter(no => Math.floor(no / 100000) === year)
    .reduce((max, n) => Math.max(max, n), 0);
  return maxNo > 0 ? maxNo + 1 : year * 100000 + 1;
}

export function getInvoiceExportData(invoices: InvoiceModel[]): string[][] {
  const headers = ['okey', 'invoiceId', 'title', 'invoiceDate', 'dueDate', 'amount', 'currency', 'state', 'paymentDate', 'receiver'];
  const rows = invoices.map(inv => [
    inv.okey ?? '',
    inv.invoiceId,
    inv.title,
    inv.invoiceDate,
    inv.dueDate,
    inv.totalAmount ? (inv.totalAmount.amount / 100).toFixed(2) : '',
    inv.totalAmount?.currency ?? '',
    inv.state,
    inv.paymentDate,
    inv.receiver ? (inv.receiver.label || getFullName(inv.receiver.name1, inv.receiver.name2)) : '',
  ]);
  return [headers, ...rows];
}
