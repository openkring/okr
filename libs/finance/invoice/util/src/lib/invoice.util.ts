import { InvoiceModel } from '@okr/shared-models';
import { addIndexElement, getFullName } from '@okr/shared-util-core';

export function newInvoice(tenantId: string): InvoiceModel {
  return new InvoiceModel(tenantId);
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
