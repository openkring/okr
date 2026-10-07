import { staticSuite } from 'vest';

import { PaymentOrderModel } from '@okr/shared-models';
import { dateValidations, stringValidations } from '@okr/shared-util-core';

/**
 * The payment order edit dialog: a debit account and an execution date are mandatory (the same
 * condition the old dialog put on its Save button); the date must be a real StoreDate. The
 * delivery method is picked from a list.
 */
export const paymentOrderValidations = staticSuite((model: PaymentOrderModel) => {

  stringValidations('debitAccountKey', model.debitAccountKey, undefined, 0, true);
  stringValidations('executionDate', model.executionDate, undefined, 0, true);
  dateValidations('executionDate', model.executionDate ?? '');
});
