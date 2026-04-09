import { InvoiceModel } from '@bk2/shared-models';
import { addIndexElement, getFullName } from '@bk2/shared-util-core';

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

export function getInvoiceExportData(invoices: InvoiceModel[]): string[][] {
  const headers = ['bkey', 'invoiceId', 'title', 'invoiceDate', 'dueDate', 'amount', 'currency', 'state', 'paymentDate', 'receiver'];
  const rows = invoices.map(inv => [
    inv.bkey ?? '',
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
