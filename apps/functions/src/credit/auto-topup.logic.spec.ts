import { describe, expect, it } from 'vitest';

import {
  autoTopUpDue, idPartRefusal, isAutoTopUpPending, newAutoTopUpRequest, pendingInvoiceRerunnable, topUpAmountRefusal, topUpTurnedPaid,
} from './auto-topup.logic';

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
  const staleBefore = '20261108100000'; // now = 20261109100000
  it('a fresh request or pending invoice blocks', () => {
    expect(isAutoTopUpPending({}, staleBefore)).toBe(false);
    expect(isAutoTopUpPending({ requestedAt: '20261109090000', pendingInvoiceKey: '' }, staleBefore)).toBe(true);
    expect(isAutoTopUpPending({ requestedAt: '20261109090000', pendingInvoiceKey: 'topup-scs-1' }, staleBefore)).toBe(true);
  });
  it('one older than 24 h no longer blocks', () => {
    expect(isAutoTopUpPending({ requestedAt: '20261108090000', pendingInvoiceKey: 'topup-scs-1' }, staleBefore)).toBe(false);
    expect(isAutoTopUpPending({ requestedAt: staleBefore, pendingInvoiceKey: '' }, staleBefore)).toBe(false);
    expect(isAutoTopUpPending({ requestedAt: '', pendingInvoiceKey: 'topup-scs-1' }, staleBefore)).toBe(false);
  });
});

describe('idPartRefusal', () => {
  it('refuses empty and slashes, never rewrites', () => {
    expect(idPartRefusal('reference', 'mailing.m1')).toBe('');
    expect(idPartRefusal('reference', '')).toBeTruthy();
    expect(idPartRefusal('reference', '  ')).toBeTruthy();
    expect(idPartRefusal('reference', 'a/b')).toBeTruthy();
    expect(idPartRefusal('reference', 5)).toBeTruthy();
  });
});

describe('pendingInvoiceRerunnable', () => {
  it('open states re-run, paid and cancelled do not', () => {
    expect(['draft', 'pending', 'partial'].every(pendingInvoiceRerunnable)).toBe(true);
    expect(['paid', 'cancelled', undefined].some(pendingInvoiceRerunnable)).toBe(false);
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
  it('a new requestedAt, also over a stale pending invoice', () => {
    expect(newAutoTopUpRequest(undefined, { requestedAt: 't1', pendingInvoiceKey: '' })).toBe('t1');
    expect(newAutoTopUpRequest({ requestedAt: 't0', pendingInvoiceKey: 'k' }, { requestedAt: 't1', pendingInvoiceKey: 'k' })).toBe('t1');
    expect(newAutoTopUpRequest({ requestedAt: 't1', pendingInvoiceKey: '' }, { requestedAt: 't1', pendingInvoiceKey: 'k' })).toBe('');
    expect(newAutoTopUpRequest({ requestedAt: 't1' }, { requestedAt: '' })).toBe('');
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
