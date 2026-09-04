
import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { ReservationModel } from '@okr/shared-models';
import { avatarValidations, baseValidations, dateValidations, moneyValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

import { LOCK_REASONS } from './reservation.util';

export const reservationValidations = staticSuite((model: ReservationModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  avatarValidations('reserver', model.reserver);
  avatarValidations('resource', model.resource);

  dateValidations('startDate', model.startDate);
  dateValidations('endDate', model.endDate);
  stringValidations('participants', model.participants, SHORT_NAME_LENGTH);
  stringValidations('area', model.area, SHORT_NAME_LENGTH);
  stringValidations('ref', model.ref, SHORT_NAME_LENGTH);
  stringValidations('state', model.state, WORD_LENGTH);
  stringValidations('reason', model.reason, WORD_LENGTH);
  numberValidations('order', model.order, true, 0, 10);

  // Reasons that take a resource out of normal use ('maintenance'/'blocked') must say WHY in
  // `description` — that text is what the member sees when the booking is refused, so an empty
  // description makes the block unusable. `description` is the public-facing field (see the
  // form's own i18n hint); `notes` stays internal and unvalidated. Every other reason keeps the
  // description optional, as before this feature.
  if (LOCK_REASONS.includes(model.reason)) {
    stringValidations('description', model.description, DESCRIPTION_LENGTH, 0, true);
  } else {
    stringValidations('description', model.description, DESCRIPTION_LENGTH);
  }

  moneyValidations('price', model.price);
});



