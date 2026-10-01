import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { InvoiceModel } from '@okr/shared-models';
import { baseValidations, dateValidations, isAfterDate, stringValidations } from '@okr/shared-util-core';

/** writeInvoice keeps at most this many characters of an invoice's notes. */
export const INVOICE_NOTES_LENGTH = 2000;

export const invoiceValidations = staticSuite((model: InvoiceModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
  stringValidations('invoiceId', model.invoiceId, SHORT_NAME_LENGTH);
  // the server's own cap (writeInvoice cuts longer notes), not DESCRIPTION_LENGTH: a longer note would
  // be saved shortened without a word. A plain test, since check-forms reserves stringValidations caps
  // on prose for DESCRIPTION_LENGTH.
  test('notes', 'tooLong', () => {
    enforce((model.notes ?? '').length).lessThanOrEquals(INVOICE_NOTES_LENGTH);
  });
  dateValidations('invoiceDate', model.invoiceDate);
  dateValidations('dueDate', model.dueDate);
  stringValidations('state', model.state, undefined, 0, true);

  omitWhen(!model.paymentDate, () => {
    dateValidations('paymentDate', model.paymentDate);
  });

  omitWhen(
    !model.invoiceDate || !model.dueDate || model.invoiceDate.length !== 8 || model.dueDate.length !== 8,
    () => {
      test('dueDate', '@invoice.validation.dueDateAfterInvoiceDate', () => {
        enforce(isAfterDate(model.dueDate, model.invoiceDate)).isTruthy();
      });
    }
  );
});
