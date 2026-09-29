/** Map kb_item_status_id to InvoiceModel.state — the same values the migration writes (spec 1.68). */
export function mapInvoiceStatus(statusId: number): string {
  switch (statusId) {
    case 7: return 'draft';
    case 8: return 'pending';
    case 9: return 'paid';
    case 16: return 'partial';
    case 19: return 'cancelled';
    case 31: return 'unpaid';
    default: return String(statusId);
  }
}

/** State, plus paymentDate only when bexio yielded one — an empty value must not wipe a migrated date. */
export function invoiceSyncFields(statusId: number, paymentDate: string): Record<string, string> {
  return paymentDate ? { state: mapInvoiceStatus(statusId), paymentDate } : { state: mapInvoiceStatus(statusId) };
}
