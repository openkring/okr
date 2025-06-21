import { only, staticSuite} from 'vest';
import { booleanValidations, categoryValidations, stringValidations } from '@bk2/shared/util';
import { SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { AvatarUsage, DeliveryType, Language, NameDisplay, PersonSortCriteria } from '@bk2/shared/models';
import { SettingsFormModel } from './settings-form.model';

export const settingsFormValidations = staticSuite((model: SettingsFormModel, field?: string) => {
  only(field);
  categoryValidations('language', model.language, Language);
  booleanValidations('showDebugInfo', model.showDebugInfo);
  booleanValidations('showArchivedData', model.showArchivedData);
  booleanValidations('showHelpers', model.showHelpers);
  stringValidations('userKey', model.userKey, SHORT_NAME_LENGTH);
  booleanValidations('useTouchId', model.useTouchId);
  booleanValidations('useFaceId', model.useFaceId);
  categoryValidations('avatarUsage', model.avatarUsage, AvatarUsage);
  stringValidations('gravatarEmail', model.gravatarEmail, SHORT_NAME_LENGTH);
  categoryValidations('nameDisplay', model.nameDisplay, NameDisplay);
  booleanValidations('useDisplayName', model.useDisplayName);
  categoryValidations('personSortCriteria', model.personSortCriteria, PersonSortCriteria);
  categoryValidations('newsDelivery', model.newsDelivery, DeliveryType);
  categoryValidations('invoiceDelivery', model.invoiceDelivery, DeliveryType);
});

