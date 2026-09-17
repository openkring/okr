import { DEFAULT_PERIODICITY } from '@okr/shared-constants';
import { BankImportRowModel, MoneyModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { toImportRows, withFee } from './bank-import-row.util';
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

describe('withFee', () => {
  // A row as Firestore hands it back: a plain object, no class field initialisers.
  const stored = (over: Partial<BankImportRowModel> = {}) =>
    ({ okey: 'k', amount: new MoneyModel(-5000, 'EUR'), ...over }) as BankImportRowModel;

  it('fills fee on a legacy row written before spec 1.62', () => {
    const row = withFee(stored());
    expect(row.fee).toEqual(new MoneyModel(0, 'EUR'));
  });

  it('takes the currency from amount, so net = amount - fee stays one currency', () => {
    expect(withFee(stored()).fee.currency).toBe('EUR');
  });

  it('falls back to CHF when even amount is missing', () => {
    expect(withFee(stored({ amount: undefined as unknown as MoneyModel })).fee.currency).toBe('CHF');
  });

  it('leaves a row that already carries a fee untouched, identity included', () => {
    const row = stored({ fee: new MoneyModel(250, 'EUR') });
    expect(withFee(row)).toBe(row);
  });

  it('keeps a zero fee written by the parse path — it is present, not missing', () => {
    const row = stored({ fee: new MoneyModel(0, 'EUR') });
    expect(withFee(row)).toBe(row);
  });
});
