import { AvatarUsage, DefaultLanguage, DeliveryType, NameDisplay, PersonModel, PersonSortCriteria, PrivacyUsage, UserModel } from '@bk2/shared-models';
import { AhvFormat, formatAhv } from '@bk2/shared-util-angular';
import { die } from '@bk2/shared-util-core';

import { PersonalDataFormModel } from './personal-data-form.model';
import { PrivacyFormModel } from './privacy-form.model';
import { SettingsFormModel } from './settings-form.model';

export function convertPersonToDataForm(person?: PersonModel): PersonalDataFormModel {
  if (!person) {
    return {
      personKey: 'personKey', // readonly
      firstName: 'firstName', // readonly
      lastName: 'lastName', // readonly
      gender: undefined, // readonly
      dateOfBirth: '', // readonly
      ssnId: '',
    };
  }
  return {
    personKey: person.bkey, // readonly
    firstName: person.firstName, // readonly
    lastName: person.lastName, // readonly
    gender: person.gender, // readonly
    dateOfBirth: person.dateOfBirth, // readonly
    ssnId: formatAhv(person.ssnId, AhvFormat.Friendly),
  };
}

export function convertUserToSettingsForm(user?: UserModel): SettingsFormModel {
  if (!user) die('profile.util.convertUserToSettingsForm: User is mandatory.');
  return {
    language: user.userLanguage,
    showDebugInfo: user.showDebugInfo,
    showArchivedData: user.showArchivedData,
    showHelpers: user.showHelpers,
    userKey: user.bkey,
    useTouchId: user.useTouchId,
    useFaceId: user.useFaceId,
    avatarUsage: user.avatarUsage,
    gravatarEmail: user.gravatarEmail,
    nameDisplay: user.nameDisplay,
    useDisplayName: user.useDisplayName,
    personSortCriteria: user.personSortCriteria,
    newsDelivery: user.newsDelivery,
    invoiceDelivery: user.invoiceDelivery,
  };
}

export function convertUserToPrivacyForm(user?: UserModel): PrivacyFormModel {
  if (!user) die('profile.util.convertUserToPrivacyForm: User is mandatory.');
  return {
    usageImages: user.usageImages,
    usageDateOfBirth: user.usageDateOfBirth,
    usagePostalAddress: user.usagePostalAddress,
    usageEmail: user.usageEmail,
    usagePhone: user.usagePhone,
    usageName: user.usageName,
    srvEmail: user.srvEmail,
  };
}

export function convertPersonalDataFormToPerson(vm: PersonalDataFormModel, person?: PersonModel): PersonModel {
  if (!person) die('profile.util.convertPersonalDataFormToPerson: Person is mandatory.');
  person.ssnId = formatAhv(vm.ssnId ?? '', AhvFormat.Electronic);
  return person;
}

export function convertSettingsFormToUser(vm: SettingsFormModel, user?: UserModel): UserModel {
  if (!user) die('profile.util.convertSettingsFormToUser: User is mandatory.');
  user.userLanguage = vm.language ?? DefaultLanguage;
  user.showDebugInfo = vm.showDebugInfo ?? false;
  user.showArchivedData = vm.showArchivedData ?? false;
  user.showHelpers = vm.showHelpers ?? true;
  user.useTouchId = vm.useTouchId ?? false;
  user.useFaceId = vm.useFaceId ?? false;
  user.avatarUsage = vm.avatarUsage ?? AvatarUsage.PhotoFirst;
  user.gravatarEmail = vm.gravatarEmail ?? '';
  user.nameDisplay = vm.nameDisplay ?? NameDisplay.FirstLast;
  user.useDisplayName = vm.useDisplayName ?? false;
  user.personSortCriteria = vm.personSortCriteria ?? PersonSortCriteria.Lastname;
  user.newsDelivery = vm.newsDelivery ?? DeliveryType.EmailAttachment;
  user.invoiceDelivery = vm.invoiceDelivery ?? DeliveryType.EmailAttachment;
  return user;
}

export function convertPrivacyFormToUser(vm: PrivacyFormModel, user: UserModel): UserModel {
  user.usageImages = vm.usageImages ?? PrivacyUsage.Public;
  user.usageDateOfBirth = vm.usageDateOfBirth ?? PrivacyUsage.Restricted;
  user.usagePostalAddress = vm.usagePostalAddress ?? PrivacyUsage.Restricted;
  user.usageEmail = vm.usageEmail ?? PrivacyUsage.Restricted;
  user.usagePhone = vm.usagePhone ?? PrivacyUsage.Restricted;
  user.usageName = vm.usageName ?? PrivacyUsage.Restricted;
  user.srvEmail = vm.srvEmail ?? true;
  return user;
}
