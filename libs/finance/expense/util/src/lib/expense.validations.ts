import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { ExpenseTransferTo } from '@okr/shared-models';
import { ibanValidations } from '@okr/subject-address-util';

import { ALLOWED_CURRENCIES } from './expense.util';

export type { ExpenseTransferTo };

export interface ExpenseFormValue {
  abstract: string;
  amountCHF: number;
  currency: string;
  transferTo: ExpenseTransferTo;
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
    enforce(model.currency).inside([...ALLOWED_CURRENCIES]);
  });

  // An IBAN is only required (and validated) when the transfer goes to the employee.
  omitWhen(model.transferTo !== 'me', () => {
    test('iban', '@finance/expense/feature.validation.ibanRequired', () => {
      enforce(model.iban).isNotBlank();
    });
    ibanValidations('iban', model.iban);
  });
});

/**
 * The editable subset of an expense — exactly the fields the `updateExpense` callable accepts.
 * Lives here (next to `ExpenseFormValue`) because its Vest suite must be able to name its fields.
 */
export interface ExpenseEditFormValue {
  abstract: string;
  /** cents, as stored on the model (the form renders/parses CHF) */
  amountTotal: number;
  currency: string;
  transferTo: ExpenseTransferTo;
  category: string;
  costCenterId: string;
  note: string;
  status: string;
}

/**
 * Treasurer edit validations. Deliberately NOT `expenseValidations`: the edit form holds the
 * amount in cents (`amountTotal`) and owns no IBAN, so the create suite's `amountCHF`/`iban`
 * tests do not apply. The message keys are shared with the create suite.
 */
export const expenseEditValidations = staticSuite((model: ExpenseEditFormValue, field?: string) => {
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

  test('amountTotal', '@finance/expense/feature.validation.amountRequired', () => {
    enforce(model.amountTotal).greaterThan(0);
  });
  test('amountTotal', '@finance/expense/feature.validation.amountMax', () => {
    enforce(model.amountTotal).lessThanOrEquals(999999999);
  });

  test('currency', '@finance/expense/feature.validation.currencyRequired', () => {
    enforce(model.currency).isNotEmpty();
  });
  test('currency', '@finance/expense/feature.validation.currencyInvalid', () => {
    enforce(model.currency).inside([...ALLOWED_CURRENCIES]);
  });

  // `status` is not validated here: the form feeds it from okr-cat-select over the items of
  // getExpenseEditStateCategory() (EXPENSE_EDIT_STATES — the hand-settable subset), and the
  // updateExpense CF re-checks the value against its own VALID_STATUS. A third copy of the list
  // would be the duplication, not the check.
});
