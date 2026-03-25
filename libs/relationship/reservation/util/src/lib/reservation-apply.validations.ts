
import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { ReservationApplyModel } from '@bk2/shared-models';
import { avatarValidations, booleanValidations, dateValidations, stringValidations } from '@bk2/shared-util-core';

export const reservationApplyValidations = staticSuite((model: ReservationApplyModel, field?: string) => {
  if (field) only(field);

  stringValidations('name', model.name, SHORT_NAME_LENGTH, 5, true);  
  avatarValidations('reserver', model.reserver);
  avatarValidations('resource', model.resource);

  dateValidations('startDate', model.startDate);
  dateValidations('endDate', model.endDate);
  stringValidations('participants', model.participants, SHORT_NAME_LENGTH);
  stringValidations('area', model.area, SHORT_NAME_LENGTH);
  stringValidations('reason', model.reason, WORD_LENGTH);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  
  booleanValidations('usesTent', model.usesTent);
  stringValidations('company', model.company, SHORT_NAME_LENGTH);
  booleanValidations('isConfirmed', model.isConfirmed, true);
});



