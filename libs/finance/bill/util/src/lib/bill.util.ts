import { BillModel } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

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
