import { describe, expect, it } from 'vitest';
import { creditBookingKey, creditBookingLines, creditDecision, signMatchesKind } from './credit.logic';

describe('creditDecision', () => {
  it('deducts within the balance', () => expect(creditDecision(500, -120)).toEqual({ ok: true, balanceAfter: 380 }));
  it('refuses to go below 0', () => expect(creditDecision(100, -120)).toEqual({ ok: false, reason: 'insufficient-credit' }));
  it('allows going exactly to 0', () => expect(creditDecision(120, -120)).toEqual({ ok: true, balanceAfter: 0 }));
  it('tops up', () => expect(creditDecision(0, 2000)).toEqual({ ok: true, balanceAfter: 2000 }));
});

describe('creditBookingLines', () => {
  const m = (amount: number) => ({ amount, currency: 'CHF' });
  it('deduction: debit prepayment, credit revenue', () =>
    expect(creditBookingLines('deduction', -120, 'P', 'R')).toEqual([{ accountKey: 'P', debitAmount: m(120) }, { accountKey: 'R', creditAmount: m(120) }]));
  it('reversal: the opposite', () =>
    expect(creditBookingLines('reversal', 120, 'P', 'R')).toEqual([{ accountKey: 'R', debitAmount: m(120) }, { accountKey: 'P', creditAmount: m(120) }]));
  it('correction follows its sign', () => {
    expect(creditBookingLines('correction', -50, 'P', 'R')?.[0]).toEqual({ accountKey: 'P', debitAmount: m(50) });
    expect(creditBookingLines('correction', 50, 'P', 'R')?.[0]).toEqual({ accountKey: 'R', debitAmount: m(50) });
  });
  it('topup has no booking', () => expect(creditBookingLines('topup', 2000, 'P', 'R')).toBeNull());
  it('key', () => expect(creditBookingKey('scs', 'e1')).toBe('credit-scs-e1'));
});

describe('signMatchesKind', () => {
  it('requires the sign of each kind', () => {
    expect(signMatchesKind('deduction', -1)).toBe(true);
    expect(signMatchesKind('deduction', 1)).toBe(false);
    expect(signMatchesKind('reversal', 1)).toBe(true);
    expect(signMatchesKind('reversal', -1)).toBe(false);
    expect(signMatchesKind('topup', 1)).toBe(true);
    expect(signMatchesKind('topup', -1)).toBe(false);
    expect(signMatchesKind('correction', -5)).toBe(true);
    expect(signMatchesKind('correction', 5)).toBe(true);
    expect(signMatchesKind('correction', 0)).toBe(false);
  });
});
