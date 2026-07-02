import { only, staticSuite } from 'vest';

import { AvatarUsage, Language, NameDisplay, PersonSortCriteria } from '@okr/shared-models';
import { booleanValidations, categoryValidations } from '@okr/shared-util-core';

import { UserDisplayFormModel } from './user-display-form.model';

export const userDisplayFormValidations = staticSuite((model: UserDisplayFormModel, field?: string) => {
  only(field);

  categoryValidations('avatarUsage', model.avatarUsage, AvatarUsage);
  categoryValidations('personSortCriteria', model.personSortCriteria, PersonSortCriteria);
  categoryValidations('userLanguage', model.userLanguage, Language);
  categoryValidations('nameDisplay', model.nameDisplay, NameDisplay);
  booleanValidations('showArchivedData', model.showArchivedData);
  booleanValidations('showDebugInfo', model.showDebugInfo);
  booleanValidations('showHelpers', model.showHelpers);
});

