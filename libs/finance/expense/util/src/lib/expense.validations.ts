import { enforce, only, staticSuite, test } from 'vest';

import { ibanValidations } from '@bk2/subject-address-util';

import { ALLOWED_CURRENCIES } from './expense.util';

export interface ExpenseFormValue {
  abstract: string;
  amountCHF: number;
  currency: string;
  iban: string;
  category: string;
  costCenterId: string;
  note: string;
}

export const expenseValidations = staticSuite((model: ExpenseFormValue, field?: string) => {
  if (field) only(field);

  test('abstract', '@finance/expense/feature.validation.abstractRequired', () => {
    enforce(model.abstract).isNotEmpty();
  });
  test('abstract', '@finance/expense/feature.validation.abstractMin', () => {
    enforce(model.abstract.length).greaterThanOrEquals(3);
  });
  test('abstract', '@finance/expense/feature.validation.abstractMax', () => {
    enforce(model.abstract.length).lessThanOrEquals(200);
  });

  test('amountCHF', '@finance/expense/feature.validation.amountRequired', () => {
    enforce(model.amountCHF).greaterThan(0);
  });
  test('amountCHF', '@finance/expense/feature.validation.amountMax', () => {
    enforce(model.amountCHF).lessThanOrEquals(9999999.99);
  });

  test('currency', '@finance/expense/feature.validation.currencyRequired', () => {
    enforce(model.currency).isNotEmpty();
  });
  test('currency', '@finance/expense/feature.validation.currencyInvalid', () => {
    enforce(model.currency).isIn([...ALLOWED_CURRENCIES]);
  });

  ibanValidations('iban', model.iban);
});
