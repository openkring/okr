import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { OrgModel } from '@bk2/shared-models';
import { dateValidations, isAfterDate, stringValidations } from '@bk2/shared-util-core';

export const orgValidations = staticSuite((model: OrgModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  stringValidations('name', model.name, SHORT_NAME_LENGTH, 3, true);
  stringValidations('type', model.type, WORD_LENGTH);
  dateValidations('dateOfFoundation', model.dateOfFoundation);
  dateValidations('dateOfLiquidation', model.dateOfLiquidation);
  stringValidations('taxId', model.taxId, SHORT_NAME_LENGTH);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('bexioId', model.bexioId, 6);

  // cross field validations
  omitWhen(model.dateOfLiquidation === '' || model.dateOfFoundation === '', () => {
    test('dateOfLiquidation', '@orgLiguidationAfterFoundation', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.dateOfLiquidation, model.dateOfFoundation)).isTruthy();
    });
  });

  // cross collection validations
  // tbd: cross reference bkey in subjects
  // tbd: match zipcode and city from swisscities dictionary

});






