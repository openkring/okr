import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarUsage, DeliveryType, Language, NameDisplay, PersonSortCriteria, PrivacyUsage, UserModel } from '@bk2/shared-models';
import { baseValidations, booleanValidations, categoryValidations, stringValidations } from '@bk2/shared-util-core';

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
  categoryValidations('avatarUsage', model.avatarUsage, AvatarUsage);
  stringValidations('gravatarEmail', model.gravatarEmail, SHORT_NAME_LENGTH);
  categoryValidations('nameDisplay', model.nameDisplay, NameDisplay);
  categoryValidations('personSortCriteria', model.personSortCriteria, PersonSortCriteria);
  categoryValidations('newsDelivery', model.newsDelivery, DeliveryType);
  categoryValidations('invoiceDelivery', model.invoiceDelivery, DeliveryType);
  booleanValidations('showArchivedData', model.showArchivedData);
  booleanValidations('showDebugInfo', model.showDebugInfo);
  booleanValidations('showHelpers', model.showHelpers);

  categoryValidations('usageImages', model.usageImages, PrivacyUsage);
  categoryValidations('usageDateOfBirth', model.usageDateOfBirth, PrivacyUsage);
  categoryValidations('usagePostalAddress', model.usagePostalAddress, PrivacyUsage);
  categoryValidations('usagePhone', model.usagePhone, PrivacyUsage);
  categoryValidations('usageEmail', model.usageEmail, PrivacyUsage);
  categoryValidations('usageName', model.usageName, PrivacyUsage);
  booleanValidations('srvEmail', model.srvEmail);
});
