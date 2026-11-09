import { describe, expect, it } from 'vitest';

import { autoTopUpDue, isAutoTopUpPending, newAutoTopUpRequest, topUpAmountRefusal, topUpTurnedPaid } from './auto-topup.logic';

const on = { enabled: true, threshold: 2000, amount: 10000 };

describe('autoTopUpDue', () => {
  it('below threshold, enabled, autopay, none pending: due', () => {
    expect(autoTopUpDue(1999, on, true, false)).toBe(true);
  });
  it('disabled: not due', () => expect(autoTopUpDue(0, { ...on, enabled: false }, true, false)).toBe(false));
  it('no autopay: not due', () => expect(autoTopUpDue(0, on, false, false)).toBe(false));
  it('one pending: not due', () => expect(autoTopUpDue(0, on, true, true)).toBe(false));
  it('at the threshold: not due', () => expect(autoTopUpDue(2000, on, true, false)).toBe(false));
  it('above the threshold: not due', () => expect(autoTopUpDue(2001, on, true, false)).toBe(false));
  it('no amount: not due', () => expect(autoTopUpDue(0, { ...on, amount: 0 }, true, false)).toBe(false));
});

describe('isAutoTopUpPending', () => {
  it('a request or a pending invoice counts', () => {
    expect(isAutoTopUpPending({})).toBe(false);
    expect(isAutoTopUpPending({ autoTopUpRequestedAt: '20261109100000' })).toBe(true);
    expect(isAutoTopUpPending({ autoTopUpPendingInvoiceKey: 'topup-scs-1' })).toBe(true);
  });
});

describe('topUpAmountRefusal', () => {
  it('refuses below CHF 50, above CHF 5000 and fractions of a Rappen', () => {
    expect(topUpAmountRefusal(4999)).toBeTruthy();
    expect(topUpAmountRefusal(500001)).toBeTruthy();
    expect(topUpAmountRefusal(5000.5)).toBeTruthy();
    expect(topUpAmountRefusal(5000)).toBe('');
    expect(topUpAmountRefusal(500000)).toBe('');
  });
});

describe('newAutoTopUpRequest', () => {
  it('only a new request without a pending invoice', () => {
    expect(newAutoTopUpRequest({}, { autoTopUpRequestedAt: 't1' })).toBe('t1');
    expect(newAutoTopUpRequest({ autoTopUpRequestedAt: 't1' }, { autoTopUpRequestedAt: 't1', balance: 5 })).toBe('');
    expect(newAutoTopUpRequest({ autoTopUpRequestedAt: 't1' }, { autoTopUpRequestedAt: '' })).toBe('');
    expect(newAutoTopUpRequest({}, { autoTopUpRequestedAt: 't1', autoTopUpPendingInvoiceKey: 'k' })).toBe('');
  });
});

describe('topUpTurnedPaid', () => {
  it('a top-up invoice moving into paid', () => {
    expect(topUpTurnedPaid({ state: 'pending', billingKind: 'topup' }, { state: 'paid', billingKind: 'topup' })).toBe(true);
    expect(topUpTurnedPaid({ state: 'paid', billingKind: 'topup' }, { state: 'paid', billingKind: 'topup' })).toBe(false);
    expect(topUpTurnedPaid({ state: 'pending', billingKind: '' }, { state: 'paid', billingKind: '' })).toBe(false);
    expect(topUpTurnedPaid({ state: 'pending' }, { state: 'partial', billingKind: 'topup' })).toBe(false);
  });
});
