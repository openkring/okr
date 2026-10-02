import { describe, expect, it } from 'vitest';
import { buildExpensePayments, ExpensePaymentSource } from './expense-payment.util';

const VALID = 'CH93 0076 2011 6238 5295 7';
const QR = [
  'SPC', '0200', '1', 'CH4431999123000889012',
  'S', 'Robert Schneider AG', 'Rue du Lac', '1268', '2501', 'Biel', 'CH',
  '', '', '', '', '', '', '',
  '1949.75', 'EUR',
  '', '', '', '', '', '', '',
  'QRR', '210000000003139471430009017', 'Rechnung 3139', 'EPD',
].join('\r\n');

describe('buildExpensePayments — me', () => {
  const me = { okey: 'e1', transferTo: 'me' as const, amountTotal: 4990, currency: 'CHF', iban: VALID, userName: 'Max Muster', abstract: 'Benzin' };

  it('builds one payment from the expense, not from OCR', () => {
    const plan = buildExpensePayments(me, [{ okey: 'r1', grossAmount: 9999 }]);
    expect(plan.manual).toEqual([]);
    expect(plan.drafts).toEqual([{
      ocrResultKey: '', amount: 4990, currency: 'CHF', recipientName: 'Max Muster',
      recipientIban: 'CH9300762011623852957', recipientAddress: '', reference: 'Spesen: Benzin',
      referenceType: 'NON', needsReview: false,
    }]);
  });
  it('reports a missing IBAN as manual', () =>
    expect(buildExpensePayments({ ...me, iban: '' }, [])).toEqual({ drafts: [], manual: ['me'] }));
  it('reports an invalid IBAN as manual', () =>
    expect(buildExpensePayments({ ...me, iban: 'CH00 1234' }, []).manual).toEqual(['me']));
  it('treats a missing transferTo as me (legacy documents)', () =>
    expect(buildExpensePayments({ ...me, transferTo: undefined }, []).drafts).toHaveLength(1));
  it('reports a zero amount as manual', () =>
    expect(buildExpensePayments({ ...me, amountTotal: 0 }, []).manual).toEqual(['me']));
  it('reports a non-numeric amount as manual', () =>
    expect(buildExpensePayments({ ...me, amountTotal: NaN }, []).manual).toEqual(['me']));
  it('reports an empty payee name as manual', () =>
    expect(buildExpensePayments({ ...me, userName: '' }, [])).toEqual({ drafts: [], manual: ['me'] }));
  it('reports a blank payee name as manual', () =>
    expect(buildExpensePayments({ ...me, userName: '   ' }, []).manual).toEqual(['me']));
});

describe('buildExpensePayments — issuer', () => {
  const issuer = { okey: 'e2', transferTo: 'issuer' as const, amountTotal: 100, currency: 'CHF' };

  it('uses the QR-bill: IBAN, creditor, amount and currency of the bill, QRR reference', () => {
    const plan = buildExpensePayments(issuer, [{ okey: 'r1', qrBill: QR, grossAmount: 1, currency: 'CHF' }]);
    expect(plan.drafts).toEqual([{
      ocrResultKey: 'r1', amount: 194975, currency: 'EUR', recipientName: 'Robert Schneider AG',
      recipientIban: 'CH4431999123000889012', recipientAddress: 'Rue du Lac 1268\n2501 Biel\nCH',
      reference: '210000000003139471430009017', referenceType: 'QRR', needsReview: false,
    }]);
  });
  it('falls back to grossAmount when the QR-bill leaves the amount open', () => {
    const open = QR.replace('1949.75', '');
    expect(buildExpensePayments(issuer, [{ okey: 'r1', qrBill: open, grossAmount: 5000, currency: 'EUR' }]).drafts[0].amount).toBe(5000);
  });
  it('uses the Gemini creditor with needsReview when there is no QR-bill', () => {
    const src: ExpensePaymentSource = { okey: 'r2', grossAmount: 12000, currency: 'CHF', vendor: 'Garage X',
      creditorIban: 'CH5604835012345678009', creditorName: '', creditorAddress: 'Seestrasse 5, 8712 Stäfa', reference: 'RF18539007547034' };
    expect(buildExpensePayments(issuer, [src]).drafts).toEqual([{
      ocrResultKey: 'r2', amount: 12000, currency: 'CHF', recipientName: 'Garage X',
      recipientIban: 'CH5604835012345678009', recipientAddress: 'Seestrasse 5, 8712 Stäfa',
      reference: 'RF18539007547034', referenceType: 'SCOR', needsReview: true,
    }]);
  });
  it('reports a receipt without QR-bill and without IBAN as manual', () =>
    expect(buildExpensePayments(issuer, [{ okey: 'r3', grossAmount: 100 }])).toEqual({ drafts: [], manual: ['r3'] }));
  it('builds one payment per receipt and reports the rest', () => {
    const plan = buildExpensePayments(issuer, [
      { okey: 'a', qrBill: QR },
      { okey: 'b', creditorIban: 'CH5604835012345678009', grossAmount: 100, currency: 'CHF', vendor: 'V' },
      { okey: 'c', grossAmount: 100 },
    ]);
    expect(plan.drafts.map(d => d.ocrResultKey)).toEqual(['a', 'b']);
    expect(plan.manual).toEqual(['c']);
  });
  it('reports a QR-bill with a non-numeric amount as manual', () => {
    const bad = QR.replace('1949.75', 'abc');
    expect(buildExpensePayments(issuer, [{ okey: 'r5', qrBill: bad }])).toEqual({ drafts: [], manual: ['r5'] });
  });
  it('reports a non-numeric Gemini amount as manual', () =>
    expect(buildExpensePayments(issuer, [{ okey: 'r6', creditorIban: 'CH5604835012345678009', grossAmount: NaN, vendor: 'V' }]).manual)
      .toEqual(['r6']));
  it('reports a QR-bill without a creditor name as manual', () => {
    const noName = QR.replace('Robert Schneider AG', '');
    expect(buildExpensePayments(issuer, [{ okey: 'r7', qrBill: noName }])).toEqual({ drafts: [], manual: ['r7'] });
  });
  it('falls back to the Gemini creditor when the QR-bill has no creditor name', () => {
    const noName = QR.replace('Robert Schneider AG', '');
    const plan = buildExpensePayments(issuer, [{ okey: 'r8', qrBill: noName, creditorIban: 'CH5604835012345678009', grossAmount: 100, vendor: 'V' }]);
    expect(plan.drafts.map(d => [d.recipientName, d.needsReview])).toEqual([['V', true]]);
  });
  it('reports a Gemini receipt without creditor name and vendor as manual', () =>
    expect(buildExpensePayments(issuer, [{ okey: 'r9', creditorIban: 'CH5604835012345678009', grossAmount: 100, creditorName: '' }]))
      .toEqual({ drafts: [], manual: ['r9'] }));
  it('ignores an invalid Gemini IBAN that slipped through', () =>
    expect(buildExpensePayments(issuer, [{ okey: 'r4', creditorIban: 'CH00', grossAmount: 100 }]).manual).toEqual(['r4']));
});
