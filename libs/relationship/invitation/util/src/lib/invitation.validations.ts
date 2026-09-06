import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { InvitationModel } from '@okr/shared-models';
import { booleanValidations, dateTimeValidations, dateValidations, stringValidations } from '@okr/shared-util-core';

export const invitationValidations = staticSuite((model: InvitationModel, field?: string) => {
  if (field) only(field);

  stringValidations('okey', model.okey, SHORT_NAME_LENGTH);
  booleanValidations('isArchived', model.isArchived);
  // `index` is generated (get<Model>Index) and the service overwrites it at save time, AFTER
  // this suite runs — a cap here can only reject a value the user cannot see or edit, so the
  // form would just never offer its save bar. Left uncapped on purpose; see vest.util.
  stringValidations('index', model.index);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  // invitee
  stringValidations('inviteeKey', model.inviteeKey, WORD_LENGTH);
  stringValidations('inviteeFirstName', model.inviteeFirstName, NAME_LENGTH);
  stringValidations('inviteeLastName', model.inviteeLastName, NAME_LENGTH);

  // inviter
  stringValidations('inviterKey', model.inviterKey, WORD_LENGTH);
  stringValidations('inviterFirstName', model.inviterFirstName, NAME_LENGTH);
  stringValidations('inviterLastName', model.inviterLastName, NAME_LENGTH);

  // calevent
  stringValidations('caleventKey', model.caleventKey, WORD_LENGTH);
  stringValidations('name', model.name, NAME_LENGTH);
  dateValidations('date', model.date);

  // invitation details
  stringValidations('state', model.state, WORD_LENGTH); // tbd: invitation state validation: pending, accepted, declined, maybe
  stringValidations('role', model.role, WORD_LENGTH); // tbd: invitation role validation: required, optional, info

  // sentAt/respondedAt are StoreDateTime (yyyyMMddHHmmss), not StoreDate — see InvitationModel
  dateTimeValidations('sentAt', model.sentAt);
  dateTimeValidations('respondedAt', model.respondedAt);

  booleanValidations('isLocked', model.isLocked);
});


