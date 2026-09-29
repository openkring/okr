import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

export interface BexioBill {
  id: number;
  document_no: string;
  title: string | null;
  status: string;
  overdue?: boolean;
  vendor: { name?: string } | string | null;
  bill_date: string | null;
  due_date: string | null;
  gross: string;
  attachment_ids: string[];   // UUID strings
  booking_account_ids: number[];
  created_at: string;
}

/** bexio v4 bill status → BillModel.state. Anything not paid or draft is open (todo/overdue). */
export function mapBillState(status: string, overdue?: boolean): 'draft' | 'todo' | 'paid' | 'overdue' {
  if (status === 'PAID') return 'paid';
  if (status === 'DRAFT') return 'draft';
  return overdue ? 'overdue' : 'todo';
}

function isoToStoreDate(iso: string | null): string {
  return iso ? convertDateFormatToString(iso.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate, false) : '';
}

/** True once the migration (spec 1.68) touched the bill — any of its markers is enough. */
function isMigrated(existing: Record<string, unknown> | undefined, tenantId: string): boolean {
  if (!existing) return false;
  const attachments = (existing['attachments'] as string[] | undefined) ?? [];
  return !!existing['vendor']
    || attachments.some(a => String(a).startsWith('bexio-file-'))
    || String(existing['bookingAccount'] ?? '').startsWith(tenantId)
    || String(existing['notes'] ?? '').startsWith('bexio supplier');
}

/**
 * The Firestore document for a synced bill. Once the migration (spec 1.68) has touched the bill
 * (see isMigrated), `attachments`, `bookingAccount` and `bexioVender` belong to okr and the sync leaves them alone.
 */
export function billDoc(bill: BexioBill, tenantId: string, existing: Record<string, unknown> | undefined): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    tenants: [tenantId],
    isArchived: false,
    title: bill.title ?? bill.document_no,
    billId: bill.document_no,
    billDate: isoToStoreDate(bill.bill_date),
    dueDate: isoToStoreDate(bill.due_date),
    totalAmount: { amount: Math.round((parseFloat(bill.gross) || 0) * 100), currency: 'CHF', periodicity: 'one-time' },
    state: mapBillState(bill.status, bill.overdue),
    accountingTenantId: tenantId,
  };
  if (!existing) {
    Object.assign(doc, { index: '', tags: '', notes: '', paymentDate: '' });
  }
  if (!isMigrated(existing, tenantId)) {
    doc['bexioVender'] = bill.vendor;
    doc['bookingAccount'] = bill.booking_account_ids.map(String).join(',');
    doc['attachments'] = bill.attachment_ids.map(String);
  }
  return doc;
}
