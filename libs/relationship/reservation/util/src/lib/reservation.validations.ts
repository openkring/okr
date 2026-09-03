
import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { ReservationModel } from '@okr/shared-models';
import { avatarValidations, baseValidations, dateValidations, moneyValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

/**
 * Reasons that take a resource out of normal use: a defect ('maintenance') or an admin
 * reserving it for another purpose ('blocked'). Both must say WHY in the notes — that text is
 * what the member sees when the booking is refused, so an empty note makes the block unusable.
 */
export const LOCK_REASONS = ['maintenance', 'blocked'];

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
  stringValidations('description', model.description, DESCRIPTION_LENGTH);

  if (LOCK_REASONS.includes(model.reason)) {
    stringValidations('notes', model.notes, DESCRIPTION_LENGTH, 0, true);
  }

  moneyValidations('price', model.price);
});



