
import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { ReservationModel } from '@bk2/shared-models';
import { avatarValidations, baseValidations, dateValidations, moneyValidations, numberValidations, stringValidations } from '@bk2/shared-util-core';

export const reservationValidations = staticSuite((model: ReservationModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  avatarValidations('reserver', model.reserver);
  avatarValidations('resource', model.resource);

  stringValidations('caleventKey', model.caleventKey, SHORT_NAME_LENGTH);
  dateValidations('startDate', model.startDate);
  dateValidations('endDate', model.endDate);
  stringValidations('participants', model.participants, SHORT_NAME_LENGTH);
  stringValidations('area', model.area, SHORT_NAME_LENGTH);
  stringValidations('ref', model.ref, SHORT_NAME_LENGTH);
  stringValidations('state', model.state, WORD_LENGTH);
  stringValidations('reason', model.reason, WORD_LENGTH);
  numberValidations('order', model.order, true, 0, 10);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  
  moneyValidations('price', model.price);
});



