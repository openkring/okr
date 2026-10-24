import { staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AvatarUsage, CalendarSmallScreenView, Language, NameDisplay, PersonSortCriteria, PrivacyUsage, UserModel } from '@okr/shared-models';
import { baseValidations, booleanValidations, categoryValidations, deliveryChannelsValidations, stringValidations } from '@okr/shared-util-core';

export const userValidations = staticSuite((model: UserModel, tenants: string, tags: string) => {
  baseValidations(model, tenants, tags);
  stringValidations('loginEmail', model.loginEmail, SHORT_NAME_LENGTH);
  stringValidations('personKey', model.personKey);
  stringValidations('firstName', model.firstName, SHORT_NAME_LENGTH);
  stringValidations('lastName', model.lastName, SHORT_NAME_LENGTH);
  categoryValidations('userLanguage', model.userLanguage, Language);
  categoryValidations('avatarUsage', model.avatarUsage, AvatarUsage);
  stringValidations('gravatarEmail', model.gravatarEmail, SHORT_NAME_LENGTH);
  categoryValidations('nameDisplay', model.nameDisplay, NameDisplay);
  categoryValidations('personSortCriteria', model.personSortCriteria, PersonSortCriteria);
  // legacy docs lack the field (Firestore reads skip model defaults) — validate the effective default
  categoryValidations('smallScreenCalendarView', model.smallScreenCalendarView ?? CalendarSmallScreenView.List, CalendarSmallScreenView);
  deliveryChannelsValidations('newsDelivery', model.newsDelivery);
  deliveryChannelsValidations('invoiceDelivery', model.invoiceDelivery);
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
