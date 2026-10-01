import { describe, expect, it } from 'vitest';
import { memberExpenseFields } from './expense.util';

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
