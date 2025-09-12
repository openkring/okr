import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { GenderType } from '@bk2/shared-models';
import { categoryValidations, dateValidations, stringValidations } from '@bk2/shared-util-core';

import { ssnValidations } from '@bk2/subject-person-util';

import { PersonalDataFormModel } from './personal-data-form.model';

export const personalDataFormValidations = staticSuite((model: PersonalDataFormModel, field?: string) => {
  only(field);

  stringValidations('personKey', model.personKey, SHORT_NAME_LENGTH);
  stringValidations('firstname', model.firstName, SHORT_NAME_LENGTH);
  stringValidations('lastname', model.lastName, SHORT_NAME_LENGTH);
  categoryValidations('gender', model.gender, GenderType);
  dateValidations('dateOfBirth', model.dateOfBirth);
  ssnValidations('ssnId', model.ssnId);
});

