import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { BillModel } from '@okr/shared-models';
import { baseValidations, dateValidations, isAfterDate, stringValidations } from '@okr/shared-util-core';

export const billValidations = staticSuite((model: BillModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
  stringValidations('billId', model.billId, SHORT_NAME_LENGTH);
  dateValidations('billDate', model.billDate);
  dateValidations('dueDate', model.dueDate);
  stringValidations('state', model.state, SHORT_NAME_LENGTH, 4, true);

  omitWhen(!model.paymentDate, () => {
    dateValidations('paymentDate', model.paymentDate);
  });

  omitWhen(
    !model.billDate || !model.dueDate || model.billDate.length !== 8 || model.dueDate.length !== 8,
    () => {
      test('dueDate', '@bill.validation.dueDateAfterBillDate', () => {
        enforce(isAfterDate(model.dueDate, model.billDate)).isTruthy();
      });
    }
  );
});
