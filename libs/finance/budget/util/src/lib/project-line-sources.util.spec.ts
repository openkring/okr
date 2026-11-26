import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BookingModel, CostAllocationModel, CostCenterModel, MoneyModel } from '@okr/shared-models';
import { projectBudgetSummary } from '@okr/finance-reporting-util';

import { projectAllocationRows } from './project-allocation.util';
import { projectLineSources } from './project-line-sources.util';

const cc = (okey: string, parentKey = ''): CostCenterModel => ({ ...new CostCenterModel('scs', 'scs'), okey, parentKey });
const rule = (okey: string, extra: Partial<CostAllocationModel>): CostAllocationModel => ({ ...new CostAllocationModel('scs', 'scs', 0), okey, title: okey, ...extra });
const centers = [cc('club'), cc('club-a', 'club'), cc('other')];

describe('projectLineSources (spec 1.177 R5)', () => {
  it('needs only the projects themselves without percentage Umlagen', () => {
    expect(projectLineSources([], ['p2', 'p1'], centers, 'scs')).toEqual({ projectKeys: ['p1', 'p2'], costCenterKeys: [] });
  });

  it('adds the source project and the source Kostenstelle subtree of percentages received', () => {
    const rules = [
      rule('pp', { scope: 'project', mode: 'percent', fromProjectKey: 'p9', toProjectKey: 'p1' }),
      rule('cp', { scope: 'centerToProject', mode: 'percent', fromCostCenterKey: 'club', toProjectKey: 'p2' }),
    ];
    expect(projectLineSources(rules, ['p1', 'p2'], centers, 'scs')).toEqual({ projectKeys: ['p1', 'p2', 'p9'], costCenterKeys: ['club', 'club-a'] });
  });

  it('ignores fixed amounts, Umlagen given away, archived rules, other books and projects not listed', () => {
    const rules = [
      rule('amount', { scope: 'project', mode: 'amount', fromProjectKey: 'p9', toProjectKey: 'p1' }),
      rule('away', { scope: 'project', mode: 'percent', fromProjectKey: 'p1', toProjectKey: 'p8' }),
      rule('arch', { scope: 'project', mode: 'percent', fromProjectKey: 'p7', toProjectKey: 'p1', isArchived: true }),
      rule('gss', { ...new CostAllocationModel('scs', 'gss', 0), scope: 'project', mode: 'percent', fromProjectKey: 'p6', toProjectKey: 'p1' }),
    ];
    expect(projectLineSources(rules, ['p1'], centers, 'scs')).toEqual({ projectKeys: ['p1'], costCenterKeys: [] });
  });

  it('gives the same Ist as the whole ledger', () => {
    const accounts = [{ ...new AccountModel('scs'), okey: 'a3', id: '3400' }, { ...new AccountModel('scs'), okey: 'a4', id: '4400' }] as AccountModel[];
    const bk = (okey: string, date: string): BookingModel => ({ ...new BookingModel('scs', 'scs'), okey, date, status: 'posted' } as BookingModel);
    const ln = (bookingKey: string, accountKey: string, debit: number, credit: number, extra: Partial<BookingLineModel>): BookingLineModel =>
      ({ ...new BookingLineModel('scs', 'scs'), bookingKey, accountKey, debitAmount: new MoneyModel(debit, 'CHF'), creditAmount: new MoneyModel(credit, 'CHF'), ...extra } as BookingLineModel);
    const bookings = [bk('b1', '20260110'), bk('b2', '20260210'), bk('b3', '20260310'), bk('b4', '20260410')];
    const lines = [
      ln('b1', 'a4', 1000, 0, { projectKey: 'p1' }), ln('b1', 'a3', 0, 300, { projectKey: 'p1' }),
      ln('b2', 'a4', 4000, 0, { projectKey: 'p9' }),
      ln('b3', 'a4', 8000, 0, { costCenterKey: 'club-a' }),
      ln('b4', 'a4', 99999, 0, { costCenterKey: 'other' }), ln('b4', 'a3', 0, 5555, {}),
    ];
    const rules = [
      rule('pp', { scope: 'project', mode: 'percent', percent: 50, side: 'expense', fromProjectKey: 'p9', toProjectKey: 'p1' }),
      rule('cp', { scope: 'centerToProject', mode: 'percent', percent: 10, side: 'expense', fiscalYear: 2026, fromCostCenterKey: 'club', toProjectKey: 'p1' }),
    ];
    const summary = (ls: BookingLineModel[], bs: BookingModel[]) =>
      projectBudgetSummary('p1', 0, 0, ls, bs, accounts, projectAllocationRows(rules, 'p1', ls, bs, accounts, centers, 1, 'scs'));

    const src = projectLineSources(rules, ['p1'], centers, 'scs');
    const reduced = lines.filter(l => src.projectKeys.includes(l.projectKey ?? '') || src.costCenterKeys.includes(l.costCenterKey ?? ''));
    const reducedBookings = bookings.filter(b => reduced.some(l => l.bookingKey === b.okey));
    expect(reduced.length).toBeLessThan(lines.length);
    expect(summary(reduced, reducedBookings)).toEqual(summary(lines, bookings));
    expect(summary(lines, bookings).expense.actual).toBe(1000 + 2000 + 800);
  });
});
