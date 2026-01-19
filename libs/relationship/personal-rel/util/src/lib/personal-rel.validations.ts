
import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { PersonalRelModel } from '@bk2/shared-models';
import { dateValidations, isAfterOrEqualDate, stringValidations } from '@bk2/shared-util-core';

export const personalRelValidations = staticSuite((model: PersonalRelModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  // subject
  stringValidations('subjectKey', model.subjectKey, SHORT_NAME_LENGTH);
  stringValidations('subjectFirstName', model.subjectFirstName, SHORT_NAME_LENGTH);
  stringValidations('subjectLastName', model.subjectLastName, SHORT_NAME_LENGTH);
  stringValidations('subjectGender', model.subjectGender, WORD_LENGTH);

  // object
  stringValidations('objectKey', model.objectKey, SHORT_NAME_LENGTH);
  stringValidations('objectFirstName', model.objectFirstName, SHORT_NAME_LENGTH);
  stringValidations('objectLastName', model.objectLastName, SHORT_NAME_LENGTH);
  stringValidations('objectGender', model.objectGender, WORD_LENGTH);

  stringValidations('type', model.type, WORD_LENGTH);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

    // cross field validations
  omitWhen(model.validFrom === '' || model.validTo === '', () => {
    test('validTo', '@personalRelValidToAfterValidFrom', () => {
      enforce(isAfterOrEqualDate(model.validTo, model.validFrom)).isTruthy();
    });
  });
});



