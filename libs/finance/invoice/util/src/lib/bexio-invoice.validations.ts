import { staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { dateValidations, stringValidations } from '@okr/shared-util-core';

import { BexioInvoiceFormModel } from './bexio-invoice.util';

export const bexioInvoiceValidations = staticSuite((model: BexioInvoiceFormModel) => {

  stringValidations('title', model.title, SHORT_NAME_LENGTH);
  stringValidations('bexioId', model.bexioId, SHORT_NAME_LENGTH);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);
});