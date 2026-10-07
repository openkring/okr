import { enforce, omitWhen, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { BillModel } from '@okr/shared-models';
import { baseValidations, dateValidations, isAfterDate, stringValidations } from '@okr/shared-util-core';

import { BILL_IBAN_LENGTH, BILL_REFERENCE_LENGTH } from './bill-line.util';

/**
 * The header of a native draft bill (spec 1.85). State, total, payments and payment date are
 * server-owned and not edited in the form; the lines have their own suite (billLinesValidations).
 */
export const billValidations = staticSuite((model: BillModel, tenants: string, tags: string) => {
  baseValidations(model, tenants, tags);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
  stringValidations('billId', model.billId, SHORT_NAME_LENGTH);
  dateValidations('billDate', model.billDate);
  dateValidations('dueDate', model.dueDate);
  // legacy docs may lack the two QR-bill fields
  stringValidations('paymentReference', model.paymentReference ?? '', BILL_REFERENCE_LENGTH);
  stringValidations('creditorIban', model.creditorIban ?? '', BILL_IBAN_LENGTH);

  omitWhen(
    !model.billDate || !model.dueDate || model.billDate.length !== 8 || model.dueDate.length !== 8,
    () => {
      test('dueDate', '@bill.validation.dueDateAfterBillDate', () => {
        enforce(isAfterDate(model.dueDate, model.billDate)).isTruthy();
      });
    }
  );
});
