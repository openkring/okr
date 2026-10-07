import { staticSuite } from 'vest';

import { NAME_LENGTH } from '@okr/shared-constants';
import { VatCodeModel } from '@okr/shared-models';
import { dateValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

/** Typing cap of the free-text fields code and name (the form binds it as [maxLength]). */
export const VAT_CODE_NAME_LENGTH = NAME_LENGTH;

/**
 * The VAT code edit dialog. It never had a mandatory field, so none is introduced here: the suite
 * only keeps code and name within the input's cap, the rate a number ≥ 0 and both validity dates
 * real StoreDates (or empty — an empty validTo means open-ended). Account and direction are picked from a list.
 */
export const vatCodeValidations = staticSuite((model: VatCodeModel) => {

  stringValidations('code', model.code, VAT_CODE_NAME_LENGTH);
  stringValidations('name', model.name, VAT_CODE_NAME_LENGTH);
  numberValidations('rate', model.rate ?? 0, false, 0);
  dateValidations('validFrom', model.validFrom ?? '');
  dateValidations('validTo', model.validTo ?? '');
});
