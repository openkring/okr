import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { InvitationModel } from '@bk2/shared-models';
import { booleanValidations, dateValidations, stringValidations } from '@bk2/shared-util-core';

export const invitationValidations = staticSuite((model: InvitationModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  booleanValidations('isArchived', model.isArchived);
  stringValidations('index', model.index, SHORT_NAME_LENGTH);
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

  dateValidations('sentAt', model.sentAt);
  dateValidations('respondedAt', model.respondedAt);
});


