import { describe, expect, it } from 'vitest';
import { collectingMessageId, collectingOrderId, expensePaymentId, expensePaymentTransition, memberExpenseFields } from './expense.util';

describe('memberExpenseFields', () => {
  const data = {
    abstract: 'Bootsmaterial', amountTotal: 12500, currency: 'EUR', transferTo: 'issuer' as const,
    iban: 'CH93 0076 2011 6238 5295 7', accountKey: 'acc-6300', costCenterId: 'cc-jun', note: 'n',
  };

  it('ignores a Kostenstelle sent on the member create path (members do not pick one)', () =>
    expect(memberExpenseFields(data).costCenterId).toBe(''));

  it('keeps the fields a member does fill in', () =>
    expect(memberExpenseFields(data)).toEqual({
      abstract: 'Bootsmaterial', amountTotal: 12500, currency: 'EUR', transferTo: 'issuer',
      iban: 'CH93 0076 2011 6238 5295 7', accountKey: 'acc-6300', costCenterId: '', note: 'n',
    }));

  it('defaults missing values', () =>
    expect(memberExpenseFields({ amountTotal: 100 })).toEqual({
      abstract: '', amountTotal: 100, currency: 'CHF', transferTo: 'me', iban: '', accountKey: '', costCenterId: '', note: '',
    }));
});

describe('expensePaymentTransition', () => {
  it('creates on the move into done', () =>
    expect(expensePaymentTransition({ status: 'processing' }, { status: 'done' })).toBe('create'));
  it('does nothing on a further write to a done expense', () =>
    expect(expensePaymentTransition({ status: 'done' }, { status: 'done' })).toBe('none'));
  it('withdraws when done is reopened', () =>
    expect(expensePaymentTransition({ status: 'done' }, { status: 'processing' })).toBe('withdraw'));
  it('withdraws when done is cancelled', () =>
    expect(expensePaymentTransition({ status: 'done' }, { status: 'cancelled' })).toBe('withdraw'));
  it('withdraws when a done expense is archived', () =>
    expect(expensePaymentTransition({ status: 'done' }, { status: 'done', isArchived: true })).toBe('withdraw'));
  it('ignores creates and deletes', () => {
    expect(expensePaymentTransition(undefined, { status: 'done' })).toBe('none');
    expect(expensePaymentTransition({ status: 'done' }, undefined)).toBe('none');
  });
  it('does nothing between non-done states', () =>
    expect(expensePaymentTransition({ status: 'draft' }, { status: 'processing' })).toBe('none'));
});

describe('payment ids', () => {
  it('derives a deterministic payment id — second create is a no-op', () => {
    expect(expensePaymentId('e1', '')).toBe('e1-me');
    expect(expensePaymentId('e1', 'r9')).toBe('e1-r9');
  });
  it('derives a deterministic collecting order id per day and generation', () =>
    expect(collectingOrderId('scs', '20261002', 1)).toBe('scs-exp-20261002-1'));
  it('keeps the message id within 35 characters', () => {
    expect(collectingMessageId('scs', '20261002', 1)).toBe('SCS-EXP-20261002-1');
    expect(collectingMessageId('averyveryverylongtenantname', '20261002', 12).length).toBeLessThanOrEqual(35);
  });
});
