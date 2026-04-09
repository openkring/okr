import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { InvoiceModel } from '@bk2/shared-models';
import { baseValidations, dateValidations, isAfterDate, stringValidations } from '@bk2/shared-util-core';

export const invoiceValidations = staticSuite((model: InvoiceModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
  stringValidations('invoiceId', model.invoiceId, SHORT_NAME_LENGTH);
  dateValidations('invoiceDate', model.invoiceDate);
  dateValidations('dueDate', model.dueDate);
  stringValidations('state', model.state, SHORT_NAME_LENGTH, 4, true);

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
