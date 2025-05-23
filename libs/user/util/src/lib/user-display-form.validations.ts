import { only, staticSuite} from 'vest';
import { booleanValidations, categoryValidations, numberValidations } from '@bk2/shared/util';
import { AvatarUsage, Language, NameDisplay, PersonSortCriteria } from '@bk2/shared/models';
import { UserDisplayFormModel } from './user-display-form.model';

export const userDisplayFormValidations = staticSuite((model: UserDisplayFormModel, field?: string) => {
  only(field);

  categoryValidations('avatarUsage', model.avatarUsage, AvatarUsage);
  categoryValidations('personSortCriteria', model.personSortCriteria, PersonSortCriteria);
  categoryValidations('userLanguage', model.userLanguage, Language);
  numberValidations('toastLength', model.toastLength, true, 0, 10000);
  categoryValidations('nameDisplay', model.nameDisplay, NameDisplay);
  booleanValidations('useDisplayName', model.useDisplayName);
  booleanValidations('showArchivedData', model.showArchivedData);
  booleanValidations('showDebugInfo', model.showDebugInfo);
  booleanValidations('showHelpers', model.showHelpers);
});

