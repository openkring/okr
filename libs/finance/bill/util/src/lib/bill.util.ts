import { BillModel } from '@bk2/shared-models';
import { addIndexElement } from '@bk2/shared-util-core';

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
