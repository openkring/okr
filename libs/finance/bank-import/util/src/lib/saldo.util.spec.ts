import { describe, expect, it } from 'vitest';

import { checkSaldo } from './saldo.util';
import { ParsedRow } from './types';

const r = (lineNo: number, amount: number, saldo?: number): ParsedRow =>
  ({ date: '20250101', rawText: '', payee: '', amount, currency: 'CHF', bankReference: '', lineNo, ...(saldo !== undefined ? { saldo } : {}) });

describe('checkSaldo', () => {
  it('no saldo column → no warnings', () => {
    expect(checkSaldo([r(1, 100), r(2, -50)])).toEqual([]);
  });
  it('newest-first: saldo[i] === saldo[i+1] + amount[i]', () => {
    expect(checkSaldo([r(1, 100, 1100), r(2, -50, 1000), r(3, 20, 1050)])).toEqual([]);
  });
  it('reports exactly the mismatching line with expected and actual', () => {
    expect(checkSaldo([r(1, 100, 1200), r(2, -50, 1000)])).toEqual([{ code: 'saldo-mismatch', lineNo: 1, detail: '1100/1200' }]);
  });
  it('oldest-first files flip the pair', () => {
    expect(checkSaldo([r(1, -50, 1000), r(2, 100, 1100)], false)).toEqual([]);
  });
});
