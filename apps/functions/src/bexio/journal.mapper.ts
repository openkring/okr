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

/** The amount fields of a bexio journal row. `amount` is in the row's own currency, `base_currency_amount` in CHF. */
export interface BexioJournalAmounts {
  amount: string | number;
  currency_id?: number | null;
  base_currency_id?: number | null;
  base_currency_amount?: string | number | null;
}

interface JournalMoney { amount: number; currency: string; periodicity: 'one-time'; }

/**
 * CHF amount of a journal row plus, for a foreign-currency row, its original amount (spec 1.68).
 * bexio's `amount` is in the transaction currency — booking it as CHF skewed every EUR payment.
 */
export function journalLineAmounts(entry: BexioJournalAmounts, currencyCodes: Map<number, string>): { chf: JournalMoney; fx: JournalMoney | null } {
  const cents = (v: string | number) => Math.round(Number(v) * 100);
  const base = entry.base_currency_amount ?? entry.amount;
  const chf: JournalMoney = { amount: cents(base), currency: 'CHF', periodicity: 'one-time' };
  const isFx = entry.currency_id != null && entry.base_currency_id != null && entry.currency_id !== entry.base_currency_id;
  const fx: JournalMoney | null = isFx
    ? { amount: cents(entry.amount), currency: currencyCodes.get(entry.currency_id as number) ?? String(entry.currency_id), periodicity: 'one-time' }
    : null;
  return { chf, fx };
}
