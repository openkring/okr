import { describe, it, expect } from 'vitest';
import { BillModel, OcrResultModel, OrgModel } from '@okr/shared-models';
import { billDuplicateHint, billFromScan } from './bill-scan.util';

const org = (okey: string, name: string): OrgModel => Object.assign(new OrgModel('scs'), { okey, name });
const ctx = { tenantId: 'scs', accountingTenantId: 'scs', orgs: [org('o1', 'iWay AG')], defaultAccountKey: 'acc-def',
  today: '20261008', currencyNote: 'Währung {currency} — bitte prüfen' };
const scan = (p: Partial<OcrResultModel>): OcrResultModel => Object.assign(new OcrResultModel('scs'), p);

describe('billFromScan', () => {
  it('prefers the QR-bill over Gemini', () => {
    const b = billFromScan(scan({ vendor: 'IWAY', grossAmount: 4000, creditorIban: 'CH00', invoiceDate: '20260901',
      invoiceNumber: 'R-1', dueDate: '20261001', subject: 'Internet September', accountKey: 'acc-6510',
      qrAmount: 3900, qrCurrency: 'CHF', qrIban: 'CH4431999123000889012', qrReference: '210000000003139471430009017',
      qrCreditorName: 'iWay AG', qrMessage: 'DSL 09', vatCodeKey: 'v81', costCenterKey: 'cc1' }), ctx);
    expect(b.title).toBe('iWay AG');
    expect(b.vendor?.key).toBe('o1');
    expect(b.creditorIban).toBe('CH4431999123000889012');
    expect(b.paymentReference).toBe('210000000003139471430009017');
    expect(b.billId).toBe('R-1');
    expect(b.billDate).toBe('20260901');
    expect(b.dueDate).toBe('20261001');
    expect(b.lines).toEqual([{ title: 'DSL 09', accountKey: 'acc-6510', amount: 3900, vatCodeKey: 'v81', costCenterKey: 'cc1' }]);
    expect(b.notes).toBe('Internet September');
    expect(b.accountingTenantId).toBe('scs');
  });

  it('falls back to Gemini when there is no QR-bill', () => {
    const b = billFromScan(scan({ vendor: 'Stämpfli AG', grossAmount: 12050, creditorIban: 'CH93', reference: 'RF18',
      subject: 'Drucksachen', qrAmount: -1 }), ctx);
    expect(b.title).toBe('Stämpfli AG');
    expect(b.vendor).toBeUndefined();
    expect(b.creditorIban).toBe('CH93');
    expect(b.paymentReference).toBe('RF18');
    expect(b.billDate).toBe('20261008');
    expect(b.lines[0]).toMatchObject({ amount: 12050, accountKey: 'acc-def', title: 'Drucksachen' });
    expect(b.notes).toBe('');
  });

  it('uses Gemini for an open QR amount', () => {
    expect(billFromScan(scan({ qrAmount: -1, qrCreditorName: 'Spende', grossAmount: 5000 }), ctx).lines[0].amount).toBe(5000);
  });

  it('notes a foreign currency', () => {
    expect(billFromScan(scan({ qrAmount: 1000, qrCurrency: 'EUR' }), ctx).notes).toBe('Währung EUR — bitte prüfen');
  });

  it('survives an empty result', () => {
    const b = billFromScan(scan({}), ctx);
    expect(b.lines).toEqual([{ title: '', accountKey: 'acc-def', amount: 0, vatCodeKey: '', costCenterKey: '' }]);
    expect(b.billDate).toBe('20261008');
  });

  it('survives a legacy plain object with undefined fields', () => {
    const b = billFromScan({} as OcrResultModel, ctx);
    expect(b.lines[0].amount).toBe(0);
    expect(b.billId).toBe('');
    expect(b.dueDate).toBe('');
  });
});

describe('billDuplicateHint', () => {
  const existing = (p: Partial<BillModel>): BillModel => Object.assign(new BillModel('scs'), { okey: 'b1', state: 'todo', ...p });
  const draft = Object.assign(new BillModel('scs'), { paymentReference: '21000', billDate: '20260901',
    vendor: { key: 'o1' }, lines: [{ amount: 3900 }] }) as BillModel;
  it('finds the same reference', () => expect(billDuplicateHint(draft, [existing({ paymentReference: '21000' })])?.okey).toBe('b1'));
  it('finds the same vendor, amount and date', () => expect(billDuplicateHint(draft, [existing({
    vendor: { key: 'o1' } as never, billDate: '20260901', totalAmount: { amount: 3900, currency: 'CHF', periodicity: 'one-time' } })])?.okey).toBe('b1'));
  it('ignores paid bills', () => expect(billDuplicateHint(draft, [existing({ paymentReference: '21000', state: 'paid' })])).toBeUndefined());
  it('ignores an empty reference', () => expect(billDuplicateHint({ ...draft, paymentReference: '' } as BillModel,
    [existing({ paymentReference: '' })])).toBeUndefined());
});
