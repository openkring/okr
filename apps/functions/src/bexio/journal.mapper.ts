/** The subset of a bexio journal row the booking header needs. */
export interface BexioJournalHeader { id: number; description: string | null; }

/**
 * Header document of a synced bexio journal row. It deliberately omits `periodKey`, `documentKey`
 * and `documentKeys`: the migration (spec 1.68) sets them, and a daily merge must not reset them.
 */
export function journalBookingDoc(entry: BexioJournalHeader & Record<string, unknown>, dateStr: string, tenantId: string): Record<string, unknown> {
  return {
    tenants: [tenantId],
    isArchived: false,
    index: `d:${dateStr} no:${entry.id}`,
    tags: '',
    notes: '',
    title: entry.description ?? '',
    date: dateStr,
    bookingNo: entry.id,
    status: 'posted',
    accountingTenantId: tenantId,
  };
}
