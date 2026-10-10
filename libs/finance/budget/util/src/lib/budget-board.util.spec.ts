import { describe, expect, it } from 'vitest';

import { MyCostCenterReport } from '@okr/finance-cost-center-util';
import { ALL_COST_CENTERS, NO_COST_CENTER } from '@okr/finance-reporting-util';

import { buildBoardView } from './budget-board.util';

const LABELS = { revenue: 'Ertrag', expense: 'Aufwand', other: 'übriger Erfolg', net: 'Ergebnis', maskedTitle: '{account} — Person' };
const report: MyCostCenterReport = {
  accountingTenantId: 'scs', fiscalYear: 2026, fiscalYears: [2026], fullAccess: true,
  costCenters: [
    { okey: 'sport', id: '1', name: 'Sport', parentKey: '', type: 'group' },
    { okey: 'jun', id: '11', name: 'Junioren', parentKey: 'sport', type: 'leaf' },
    { okey: 'adm', id: '5', name: 'Verwaltung', parentKey: '', type: 'leaf' },
  ],
  accounts: [
    { okey: 'root', id: '', name: 'Kontoplan', parentKey: '', type: 'root', isArchived: false },
    { okey: 'g4', id: '4', name: 'Aufwand', parentKey: 'root', type: 'group', isArchived: false },
    { okey: 'a4400', id: '4400', name: 'Regatta', parentKey: 'g4', type: 'leaf', isArchived: false },
    { okey: 'a6500', id: '6500', name: 'Büro', parentKey: 'g4', type: 'leaf', isArchived: false },
  ],
  budget: { versionKey: 'v26', name: 'Budget GV 2026' },
  budgetLines: [
    { costCenterKey: 'jun', accountKey: 'a4400', amount: 100000 },
    { costCenterKey: 'adm', accountKey: 'a6500', amount: 20000 },
  ],
  bookings: [
    { okey: 'b1', date: '20260512', bookingNo: 7, title: 'Meldegelder', counterpartyName: 'RC Sarnen', masked: false },
    { okey: 'b2', date: '20260603', bookingNo: 9, title: '', counterpartyName: '', masked: true },
    { okey: 'b3', date: '20260701', bookingNo: 12, title: 'Papier', counterpartyName: '', masked: false },
  ],
  lines: [
    { bookingKey: 'b1', accountKey: 'a4400', costCenterKey: 'jun', debit: 82000, credit: 0 },
    { bookingKey: 'b2', accountKey: 'a4400', costCenterKey: 'jun', debit: 15000, credit: 0 },
    { bookingKey: 'b3', accountKey: 'a6500', costCenterKey: '', debit: 3000, credit: 0 },
  ],
};
const open = new Set(['g4']);

describe('buildBoardView', () => {
  it('all: totals equal the sum of every line and budget line', () => {
    const v = buildBoardView(report, ALL_COST_CENTERS, open, LABELS);
    expect(v.comparison.expense).toEqual({ actual: 100000, budget: 120000, compare: 0 });
  });
  it('a group selection is its subtree; Verwaltung and the unassigned line drop out', () => {
    const v = buildBoardView(report, 'sport', open, LABELS);
    expect(v.comparison.expense).toEqual({ actual: 97000, budget: 100000, compare: 0 });
    expect(v.comparison.rows.some(r => r.key === 'a6500')).toBe(false);
  });
  it('«ohne Kostenstelle» keeps only the unassigned lines', () => {
    const v = buildBoardView(report, NO_COST_CENTER, open, LABELS);
    expect(v.comparison.expense).toEqual({ actual: 3000, budget: 0, compare: 0 });
  });
  it('details per account, oldest first; a masked booking reads «<Konto> — Person» without counterparty', () => {
    const rows = buildBoardView(report, 'jun', open, LABELS).details.get('a4400') ?? [];
    expect(rows.map(r => [r.bookingKey, r.title, r.counterpartyName, r.amount])).toEqual([
      ['b1', 'Meldegelder', 'RC Sarnen', 82000],
      ['b2', 'Regatta — Person', '', 15000],
    ]);
  });
});
