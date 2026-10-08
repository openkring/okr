import { enforce, omitWhen, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { BillModel } from '@okr/shared-models';
import { baseValidations, dateValidations, isAfterDate, stringValidations } from '@okr/shared-util-core';

import { BILL_IBAN_LENGTH, BILL_REFERENCE_LENGTH, BILL_TITLE_MAX_LENGTH } from './bill-line.util';

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

/**
 * The header of a BOOKED or paid bill in details mode (spec 1.92): only what the treasurer can still
 * change is validated, so a legacy or migrated bill (missing billId / billDate, odd locked values) can
 * be saved. Title always; due date, reference and IBAN only while not paid; the due-date-after-bill-date
 * rule only for a due date that differs from the stored one.
 * @param stored the bill as loaded, before the edit (title and due date)
 */
export const billDetailsValidations = staticSuite((model: BillModel, stored: Pick<BillModel, 'dueDate'> & { title?: string }) => {
  // an untouched title is never re-validated (migrated / scanned names can exceed 30); a changed one is held to the server limit
  omitWhen(stored?.title !== undefined && (model.title ?? '') === stored.title, () => {
    stringValidations('title', model.title, BILL_TITLE_MAX_LENGTH);
  });
  omitWhen(model.state === 'paid', () => {
    dateValidations('dueDate', model.dueDate);
    stringValidations('paymentReference', model.paymentReference ?? '', BILL_REFERENCE_LENGTH);
    stringValidations('creditorIban', model.creditorIban ?? '', BILL_IBAN_LENGTH);
  });
  omitWhen(
    model.state === 'paid' || (model.dueDate ?? '') === (stored?.dueDate ?? '')
      || !model.billDate || !model.dueDate || model.billDate.length !== 8 || model.dueDate.length !== 8,
    () => {
      test('dueDate', '@bill.validation.dueDateAfterBillDate', () => {
        enforce(isAfterDate(model.dueDate, model.billDate)).isTruthy();
      });
    }
  );
});
