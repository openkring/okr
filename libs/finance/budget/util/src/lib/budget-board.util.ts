import { AccountModel, BookingLineModel, BookingModel, BudgetLineModel, CostCenterModel, MoneyModel } from '@okr/shared-models';
import { fill } from '@okr/shared-util-core';
import { aggregateByCostCenter, costCenterSubtreeKeys, MyCostCenterReport } from '@okr/finance-cost-center-util';
import { AccountBookingRow, bookingsByAccount, filterLinesByCostCenter } from '@okr/finance-reporting-util';

import { AccountComparison, AccountComparisonLabels, buildAccountComparison, totalsByAccount } from './budget-account-compare.util';

/** A booking behind an account row of «Meine Kostenstellen»; a masked one has no counterparty. */
export interface BoardBookingRow extends AccountBookingRow { counterpartyName: string; masked: boolean }

export interface BoardView {
  comparison: AccountComparison;
  /** account okey → its bookings, oldest first, signed like the row */
  details: Map<string, BoardBookingRow[]>;
}

/** `maskedTitle` renders a person-related booking, e.g. «{account} — Person» (single braces). */
export type BoardLabels = AccountComparisonLabels & { maskedTitle: string };

/**
 * «Meine Kostenstellen» (spec 1.65 D21): the callable's scoped data as the Soll-Ist Erfolgsrechnung of
 * the treasurer (`buildAccountComparison`), cut by the Kostenstelle selection exactly like the
 * Erfolgsrechnung filter (`ALL_COST_CENTERS`, a node's subtree, or `NO_COST_CENTER`), plus the bookings
 * behind each account. A masked booking (D22) reads `maskedTitle` with the account name.
 */
export function buildBoardView(report: MyCostCenterReport, selection: string, expandedKeys: ReadonlySet<string>, labels: BoardLabels): BoardView {
  const accounts = report.accounts.map(a => ({ ...new AccountModel(''), ...a }) as AccountModel);
  const centers = report.costCenters.map(c => ({ ...new CostCenterModel('', report.accountingTenantId), ...c }) as CostCenterModel);
  const subtree = costCenterSubtreeKeys(centers, selection);

  const lines = filterLinesByCostCenter(report.lines.map((l, i) => ({
    ...new BookingLineModel('', report.accountingTenantId), okey: `l${i}`, bookingKey: l.bookingKey, accountKey: l.accountKey,
    costCenterKey: l.costCenterKey, debitAmount: new MoneyModel(l.debit, 'CHF'), creditAmount: new MoneyModel(l.credit, 'CHF'),
  }) as BookingLineModel), selection, subtree);
  const budget = filterLinesByCostCenter(report.budgetLines.map((b, i) => ({
    ...new BudgetLineModel('', report.accountingTenantId, report.budget?.versionKey ?? ''), okey: `b${i}`,
    costCenterKey: b.costCenterKey, accountKey: b.accountKey, amount: new MoneyModel(b.amount, 'CHF'),
  }) as BudgetLineModel), selection, subtree);

  const cells = aggregateByCostCenter(lines, accounts, budget);
  const comparison = buildAccountComparison(accounts, totalsByAccount(cells), expandedKeys, labels);

  const byKey = new Map(report.bookings.map(b => [b.okey, b]));
  const bookings = report.bookings.map(b => ({
    ...new BookingModel('', report.accountingTenantId), okey: b.okey, date: b.date, bookingNo: b.bookingNo, title: b.title, status: 'posted',
  }) as BookingModel);
  const accountName = new Map(accounts.map(a => [a.okey, a.name ?? '']));
  const details = new Map<string, BoardBookingRow[]>();
  for (const [accountKey, rows] of bookingsByAccount(lines, bookings, accounts)) {
    details.set(accountKey, rows.map(r => {
      const b = byKey.get(r.bookingKey);
      const masked = b?.masked === true;
      return {
        ...r,
        title: masked ? fill(labels.maskedTitle, { account: accountName.get(accountKey) ?? '' }) : r.title,
        counterpartyName: masked ? '' : b?.counterpartyName ?? '',
        masked,
      };
    }));
  }
  return { comparison, details };
}
