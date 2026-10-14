import { AccountModel, BookingLineModel, BookingModel } from '@okr/shared-models';

import { isCashAccount } from './accounting-overview.util';

/**
 * Geldflussrechnung, direct method (spec 1.100 follow-up): where the cash of the cash accounts
 * (Kasse/Post/Bank, 1000–1059) came from and went to in a period. Amounts in minor units.
 *
 * Per posted booking that moves cash, every line on a NON-cash account contributes its own
 * credit − debit: in a balanced booking these add up exactly to the change in cash, so a bill paid
 * with a bank fee shows as Kreditoren −1000 and Bankspesen −10. Bookings that only move money
 * between cash accounts (bank → Kasse) change nothing and are left out (their volume is reported
 * as `internalTransfers`); bookings without a cash line are not a cash flow.
 */
export interface CashFlowRow {
  accountKey: string;
  accountId: string;
  accountName: string;
  /** always positive; inflow or outflow is the list it is in */
  amount: number;
}

export interface CashFlowStatement {
  inflows: CashFlowRow[];
  outflows: CashFlowRow[];
  totalIn: number;
  totalOut: number;
  net: number;
  /** cash at the start of the period; undefined while unknown */
  opening: number | undefined;
  closing: number | undefined;
  /** money moved between cash accounts (left out of the flows) */
  internalTransfers: number;
}

export function cashFlowDirect(
  bookings: BookingModel[],
  lines: BookingLineModel[],
  accounts: AccountModel[],
  from: string,
  to: string,
  opening: number | undefined,
): CashFlowStatement {
  const byKey = new Map(accounts.map(a => [a.okey, a]));
  const isCash = (accountKey: string) => { const a = byKey.get(accountKey); return !!a && isCashAccount(a); };
  const inPeriod = new Set(bookings
    .filter(b => b.status === 'posted' && (!from || (b.date ?? '') >= from) && (!to || (b.date ?? '') <= to))
    .map(b => b.okey));

  const linesByBooking = new Map<string, BookingLineModel[]>();
  for (const l of lines) {
    if (!inPeriod.has(l.bookingKey)) continue;
    linesByBooking.set(l.bookingKey, [...(linesByBooking.get(l.bookingKey) ?? []), l]);
  }

  const flowByAccount = new Map<string, number>();
  let internalTransfers = 0;
  for (const bookingLines of linesByBooking.values()) {
    const cashLines = bookingLines.filter(l => isCash(l.accountKey));
    if (cashLines.length === 0) continue;
    const otherLines = bookingLines.filter(l => !isCash(l.accountKey));
    if (otherLines.length === 0) {
      internalTransfers += cashLines.reduce((s, l) => s + (l.debitAmount?.amount ?? 0), 0);
      continue;
    }
    for (const l of otherLines) {
      const flow = (l.creditAmount?.amount ?? 0) - (l.debitAmount?.amount ?? 0);
      flowByAccount.set(l.accountKey, (flowByAccount.get(l.accountKey) ?? 0) + flow);
    }
  }

  const row = (accountKey: string, amount: number): CashFlowRow => {
    const a = byKey.get(accountKey);
    return { accountKey, accountId: a?.id ?? '', accountName: a?.name ?? accountKey, amount };
  };
  const byId = (a: CashFlowRow, b: CashFlowRow) => a.accountId.localeCompare(b.accountId);
  const entries = [...flowByAccount.entries()].filter(([, v]) => v !== 0);
  const inflows = entries.filter(([, v]) => v > 0).map(([k, v]) => row(k, v)).sort(byId);
  const outflows = entries.filter(([, v]) => v < 0).map(([k, v]) => row(k, -v)).sort(byId);
  const totalIn = inflows.reduce((s, r) => s + r.amount, 0);
  const totalOut = outflows.reduce((s, r) => s + r.amount, 0);
  const net = totalIn - totalOut;
  return {
    inflows, outflows, totalIn, totalOut, net,
    opening, closing: opening === undefined ? undefined : opening + net,
    internalTransfers,
  };
}
