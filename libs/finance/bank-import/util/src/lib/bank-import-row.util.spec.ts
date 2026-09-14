import { DEFAULT_PERIODICITY } from '@okr/shared-constants';
import { describe, expect, it } from 'vitest';

import { toImportRows } from './bank-import-row.util';
import { ParsedStatement } from './types';

const s: ParsedStatement = {
  format: 'zkb', iban: 'CH98', currency: 'CHF', bankName: 'ZKB', dateFrom: '', dateTo: '', warnings: [],
  rows: [
    { date: '20251231', rawText: 'A', payee: 'P', amount: -585205, currency: 'CHF', bankReference: '', lineNo: 2 },
    { date: '20251230', rawText: 'B', payee: '', amount: 731, currency: 'CHF', amountFx: { amount: 900, currency: 'USD' }, fxRate: 0.8, bankReference: 'R', saldo: 100, lineNo: 3 },
  ],
};
const ctx = { tenantId: 'bkg', accountingTenantId: 'bkg', bankProfileKey: 'bp1', sourceFileName: 'f.csv', importedBy: 'u1', importedAt: '20260914120000' };

describe('toImportRows', () => {
  const rows = toImportRows(s, ['k1', 'k2'], ctx);
  it('one row per parsed row, okey == importKey, status unmapped, amounts as MoneyModel', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ okey: 'k1', importKey: 'k1', tenants: ['bkg'], accountingTenantId: 'bkg', bankProfileKey: 'bp1', date: '20251231', rawText: 'A', payee: 'P', status: 'unmapped', ruleKey: '', accountKey: '', title: '', sourceFileName: 'f.csv', importedBy: 'u1', importedAt: '20260914120000' });
    expect(rows[0].amount).toEqual({ amount: -585205, currency: 'CHF', periodicity: DEFAULT_PERIODICITY });
    expect(rows[0].amountFx).toBeUndefined();
    expect(rows[1].amountFx).toEqual({ amount: 900, currency: 'USD', periodicity: DEFAULT_PERIODICITY });
    expect(rows[1].fxRate).toBe(0.8);
    expect(rows[1].bankReference).toBe('R');
    expect(rows[1].saldo).toEqual({ amount: 100, currency: 'CHF', periodicity: DEFAULT_PERIODICITY });
  });
  it('throws when keys and rows differ in length', () => {
    expect(() => toImportRows(s, ['k1'], ctx)).toThrow();
  });
});
