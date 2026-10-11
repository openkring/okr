import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BookingModel, CostAllocationModel, CostCenterModel, MoneyModel } from '@okr/shared-models';

import { projectAllocationRows } from './project-allocation.util';

const acc = (okey: string, id: string): AccountModel => ({ ...new AccountModel('scs'), okey, id, name: id });
const accounts = [acc('a3', '3400'), acc('a4', '4400'), acc('a8', '8000')];
const bk = (okey: string, date: string, status = 'posted'): BookingModel => ({ ...new BookingModel('scs', 'scs'), okey, date, status } as BookingModel);
const ln = (bookingKey: string, accountKey: string, debit: number, credit: number, extra: Partial<BookingLineModel> = {}): BookingLineModel =>
  ({ ...new BookingLineModel('scs', 'scs'), bookingKey, accountKey, debitAmount: new MoneyModel(debit, 'CHF'), creditAmount: new MoneyModel(credit, 'CHF'), ...extra } as BookingLineModel);
const cc = (okey: string, parentKey = ''): CostCenterModel => ({ ...new CostCenterModel('scs', 'scs'), okey, parentKey });
const rule = (okey: string, extra: Partial<CostAllocationModel>): CostAllocationModel => ({ ...new CostAllocationModel('scs', 'scs', 0), okey, title: okey, ...extra });

const bookings = [bk('b25', '20250510'), bk('b26', '20260510'), bk('bd', '20260601', 'draft')];
const lines = [
  ln('b25', 'a4', 6000, 0, { projectKey: 'pr1' }), ln('b26', 'a4', 2000, 0, { projectKey: 'pr1' }), ln('bd', 'a4', 9999, 0, { projectKey: 'pr1' }),
  ln('b26', 'a8', 5000, 0, { projectKey: 'pr1' }),                       // übriger Erfolg: never a base
  ln('b26', 'a4', 10000, 0, { costCenterKey: 'club' }), ln('b25', 'a4', 7000, 0, { costCenterKey: 'club' }),
];
const centers = [cc('club')];

describe('projectAllocationRows (D26)', () => {
  it('Projekt → Projekt: % of the source project Aufwand over all years, posted only, 4–6 only', () => {
    const r = projectAllocationRows([rule('pp', { scope: 'project', fromProjectKey: 'pr1', toProjectKey: 'pr2', side: 'expense', mode: 'percent', percent: 50 })],
      'pr2', lines, bookings, accounts, centers, 1, 'scs');
    expect(r).toEqual([{ key: 'allocation:pp', side: 'expense', title: 'pp', actual: 4000 }]);
  });
  it('Kostenstelle → Projekt: % of the Kostenstelle Ist in the rule fiscal year', () => {
    const r = projectAllocationRows([rule('cp', { scope: 'centerToProject', fiscalYear: 2026, fromCostCenterKey: 'club', toProjectKey: 'pr2', side: 'expense', mode: 'percent', percent: 10 })],
      'pr2', lines, bookings, accounts, centers, 1, 'scs');
    expect(r[0]).toMatchObject({ actual: 1000 });
  });
});
