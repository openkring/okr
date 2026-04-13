import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { dateValidations, stringValidations } from '@bk2/shared-util-core';

import { BexioInvoiceFormModel } from './bexio-invoice.util';

export const bexioInvoiceValidations = staticSuite((model: BexioInvoiceFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('title', model.title, SHORT_NAME_LENGTH);
  stringValidations('bexioId', model.bexioId, SHORT_NAME_LENGTH);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);
});