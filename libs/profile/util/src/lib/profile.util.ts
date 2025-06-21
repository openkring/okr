import { AvatarUsage, DefaultLanguage, DeliveryType, NameDisplay, PersonModel, PersonSortCriteria, PrivacyUsage, UserModel } from '@bk2/shared/models';
import { AhvFormat, die, formatAhv } from '@bk2/shared/util';
import { PersonalDataFormModel } from './personal-data-form.model';
import { SettingsFormModel } from './settings-form.model';
import { PrivacyFormModel } from './privacy-form.model';

export function convertPersonToDataForm(person?: PersonModel): PersonalDataFormModel {
  if (!person) return {
    personKey: 'personKey',                // readonly
    firstName: 'firstName',                // readonly
    lastName: 'lastName',                  // readonly
    gender: undefined,                     // readonly
    dateOfBirth: '',                       // readonly
    ssnId: '',

  };
  return {
      personKey: person.bkey,              // readonly
      firstName: person.firstName,         // readonly
      lastName: person.lastName,           // readonly
      gender: person.gender,               // readonly
      dateOfBirth: person.dateOfBirth,     // readonly
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
      invoiceDelivery: user.invoiceDelivery
  };
}

export function convertUserToPrivacyForm(user?: UserModel): PrivacyFormModel {
  if (!user) die('profile.util.convertUserToPrivacyForm: User is mandatory.');
  return {
      usage_images: user.usage_images,
      usage_dateOfBirth: user.usage_dateOfBirth,
      usage_postalAddress: user.usage_postalAddress,
      usage_email: user.usage_email,
      usage_phone: user.usage_phone,
      usage_name: user.usage_name
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
  user.usage_images = vm.usage_images ?? PrivacyUsage.Public;
  user.usage_dateOfBirth = vm.usage_dateOfBirth ?? PrivacyUsage.Restricted;
  user.usage_postalAddress = vm.usage_postalAddress ?? PrivacyUsage.Restricted;
  user.usage_email = vm.usage_email ?? PrivacyUsage.Restricted;
  user.usage_phone = vm.usage_phone ?? PrivacyUsage.Restricted;
  user.usage_name = vm.usage_name ?? PrivacyUsage.Restricted;
  return user;
}
