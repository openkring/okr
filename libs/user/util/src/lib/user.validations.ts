import { SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { baseValidations } from '@bk2/shared/data-access';
import { AvatarUsage, DeliveryType, Language, NameDisplay, PersonSortCriteria, PrivacyUsage, UserModel } from '@bk2/shared/models';
import { booleanValidations, categoryValidations, numberValidations, stringValidations } from '@bk2/shared/util';
import { only, staticSuite} from 'vest';

export const userValidations = staticSuite((model: UserModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);
  stringValidations('loginEmail', model.loginEmail, SHORT_NAME_LENGTH);
  stringValidations('personKey', model.personKey, SHORT_NAME_LENGTH);
  stringValidations('firstName', model.firstName, SHORT_NAME_LENGTH);
  stringValidations('lastName', model.lastName, SHORT_NAME_LENGTH);
  booleanValidations('useTouchId', model.useTouchId);
  booleanValidations('useFaceId', model.useFaceId);
  categoryValidations('userLanguage', model.userLanguage, Language);
  numberValidations('toastLength', model.toastLength, true, 0, 10000);
  categoryValidations('avatarUsage', model.avatarUsage, AvatarUsage);
  stringValidations('gravatarEmail', model.gravatarEmail, SHORT_NAME_LENGTH);
  categoryValidations('nameDisplay', model.nameDisplay, NameDisplay);
  categoryValidations('personSortCriteria', model.personSortCriteria, PersonSortCriteria);
  categoryValidations('newsDelivery', model.newsDelivery, DeliveryType);
  categoryValidations('invoiceDelivery', model.invoiceDelivery, DeliveryType);
  booleanValidations('showArchivedData', model.showArchivedData);
  booleanValidations('showDebugInfo', model.showDebugInfo);
  booleanValidations('showHelpers', model.showHelpers);

  categoryValidations('usage_images', model.usage_images, PrivacyUsage);
  categoryValidations('usage_dateOfBirth', model.usage_dateOfBirth, PrivacyUsage);
  categoryValidations('usage_postalAddress', model.usage_postalAddress, PrivacyUsage);
  categoryValidations('usage_phone', model.usage_phone, PrivacyUsage);
  categoryValidations('usage_email', model.usage_email, PrivacyUsage);
  categoryValidations('usage_name', model.usage_name, PrivacyUsage);
});
