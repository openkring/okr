import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { CITY_LENGTH, COUNTRY_LENGTH, DESCRIPTION_LENGTH, EMAIL_LENGTH, PHONE_LENGTH, SHORT_NAME_LENGTH, ZIP_LENGTH } from '@bk2/shared-constants';
import { OrgType } from '@bk2/shared-models';
import { categoryValidations, dateValidations, isAfterDate, stringValidations } from '@bk2/shared-util-core';

import { OrgNewFormModel } from './org-new-form.model';

export const orgNewFormValidations = staticSuite((model: OrgNewFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('orgName', model.orgName, SHORT_NAME_LENGTH, 3, true);
  categoryValidations('type', model.type, OrgType);
  dateValidations('dateOfFoundation', model.dateOfFoundation);
  dateValidations('dateOfLiquidation', model.dateOfLiquidation);
  stringValidations('street', model.street, SHORT_NAME_LENGTH);
  stringValidations('zipCode', model.zipCode, ZIP_LENGTH);
  stringValidations('city', model.city, CITY_LENGTH);
  stringValidations('countryCode', model.countryCode, COUNTRY_LENGTH);
  stringValidations('phone', model.phone, PHONE_LENGTH);
  stringValidations('email', model.email, EMAIL_LENGTH);
  stringValidations('web', model.web, SHORT_NAME_LENGTH);
  stringValidations('taxId', model.taxId, SHORT_NAME_LENGTH);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  stringValidations('bexioId', model.bexioId, SHORT_NAME_LENGTH);
  stringValidations('membershipCategoryKey', model.membershipCategoryKey, SHORT_NAME_LENGTH); // tbd: check whether it is valid

  //tagValidations('tags', model.tags);

  // cross field validations
  omitWhen(model.dateOfLiquidation === '' || model.dateOfFoundation === '', () => {
    test('dateOfLiquidation', '@orgLiguidationAfterFoundation', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.dateOfLiquidation!, model.dateOfFoundation!)).isTruthy();
    });
  });
  // tbd: city is mandatory if zipCode is set -> lookup from swisscities
});


