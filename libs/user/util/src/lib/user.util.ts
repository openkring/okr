import { AvatarUsage, DefaultLanguage, DeliveryType, NameDisplay, PersonSortCriteria, Roles, UserModel } from "@bk2/shared/models";
import { die, isType } from "@bk2/shared/util";
import { UserAuthFormModel } from "./user-auth-form.model";
import { UserDisplayFormModel } from "./user-display-form.model";
import { UserModelFormModel } from "./user-model-form.model";
import { UserNotificationFormModel } from "./user-notification-form.model";
import { UserPrivacyFormModel } from "./user-privacy-form.model";

/**
 * Converts a Roles object to a string of comma-separated roles.
 * @param roles , e.g. { 'admin': true, 'registered': true }
 * @returns  'admin,registered'
 */
export function flattenRoles(roles: Roles): string {
  const _flattenedRoles = Object.keys(roles);
  console.log('role keys (string[])=', _flattenedRoles);
  const _filteredRoles = _flattenedRoles.filter(_role => {
    console.log('role.' + _role + ' = ' + roles[_role as keyof Roles]);
    return (roles[_role as keyof Roles] === true);
  });
  console.log('filtered roles (string[])=', _filteredRoles);
  console.log('joined roles (string)=', _filteredRoles.join(','));
  return _filteredRoles.join(','); 
}

/**
 * Reverse function of flattenRoles. Converts a comma-separated string of roles into a Roles object.
 * @param roles comma-separated string of roles, e.g. 'admin,registered'
 * @returns Roles object, e.g. { 'admin': true, 'registered': true }
 */
export function structureRoles(roles: string): Roles {
  const _structuredRoles = roles.split(',').reduce((acc, role) => {
    acc[role as keyof Roles] = true;
    return acc;
  }, {} as Roles);
  return _structuredRoles;
}

export function convertUserToAuthForm(user: UserModel): UserAuthFormModel {
  return {
    roles: user.roles,
    useTouchId: user.useTouchId ?? false,
    useFaceId: user.useFaceId ?? false,
  };
} 

export function convertUserToDisplayForm(user: UserModel): UserDisplayFormModel {
  return {
    avatarUsage: user.avatarUsage ?? AvatarUsage.PhotoFirst,
    personSortCriteria: user.personSortCriteria ?? PersonSortCriteria.Lastname,
    userLanguage: user.userLanguage ?? DefaultLanguage,
    toastLength: user.toastLength ?? 3000,
    nameDisplay: user.nameDisplay ?? NameDisplay.FirstLast,
    useDisplayName: user.useDisplayName ?? false,
    showArchivedData: user.showArchivedData ?? false,
    showDebugInfo: user.showDebugInfo ?? false,
    showHelpers: user.showHelpers ?? true,
  };
} 

export function convertUserToModelForm(user: UserModel, firstName = '', lastName = ''): UserModelFormModel {
  return {
    bkey: user.bkey ?? die('UserUtil.convertUserToForm: user.bkey is mandatory.'),
    personKey: user.personKey ?? die('UserUtil.convertUserToForm: user.personKey is mandatory.'),
    firstName: user.firstName ?? firstName,
    lastName: user.lastName ?? lastName,
    loginEmail: user.loginEmail ?? die('UserUtil.convertUserToForm: user.loginEmail is mandatory.'),
    gravatarEmail: user.gravatarEmail ?? '',
    tenants: user.tenants ?? [],
    notes: user.notes ?? '',
    tags: user.tags,
  };
} 

export function convertUserToNotificationForm(user: UserModel): UserNotificationFormModel {
  return {
    newsDelivery: user.newsDelivery ?? DeliveryType.EmailAttachment,
    invoiceDelivery: user.invoiceDelivery ?? DeliveryType.EmailAttachment,
  };
} 
export function convertUserToPrivacyForm(user: UserModel): UserPrivacyFormModel {
  return {
    usage_images: user.usage_images ?? 0,
    usage_dateOfBirth: user.usage_dateOfBirth ?? 1,
    usage_postalAddress: user.usage_postalAddress ?? 1,
    usage_email: user.usage_email ?? 1,
    usage_phone: user.usage_phone ?? 1,
    usage_name: user.usage_name ?? 1
  };
} 

export function convertAuthFormToUser(vm: UserAuthFormModel, user?: UserModel): UserModel {
  if (!user) die('user.util.convertAuthFormToUser: User is mandatory.');
  user.roles = vm.roles ?? user.roles;
  user.useTouchId = vm.useTouchId ?? user.useTouchId;
  user.useFaceId = vm.useFaceId ?? user.useFaceId;
  return user;
}
export function convertDisplayFormToUser(vm: UserDisplayFormModel, user?: UserModel): UserModel {
  if (!user) die('user.util.convertDisplayFormToUser: User is mandatory.');
  user.avatarUsage = vm.avatarUsage ?? user.avatarUsage;
  user.personSortCriteria = vm.personSortCriteria ?? user.personSortCriteria;
  user.userLanguage = vm.userLanguage ?? user.userLanguage;
  user.toastLength = vm.toastLength ?? user.toastLength;
  user.nameDisplay = vm.nameDisplay ?? user.nameDisplay;
  user.useDisplayName = vm.useDisplayName ?? user.useDisplayName;
  user.showDebugInfo = vm.showDebugInfo ?? user.showDebugInfo;
  user.showArchivedData = vm.showArchivedData ?? user.showArchivedData;
  user.showHelpers = vm.showHelpers ?? user.showHelpers
  return user;
}
export function convertModelFormToUser(vm: UserModelFormModel, user?: UserModel): UserModel {
  if (!user) die('user.util.convertModelFormToUser: User is mandatory.');
  user.bkey = vm.bkey ?? user.bkey;
  user.personKey = vm.personKey ?? user.personKey;
  user.firstName = vm.firstName ?? user.firstName;
  user.lastName = vm.lastName ?? user.lastName;
  user.loginEmail = vm.loginEmail ?? user.loginEmail;   // be careful: this should not be changed.
  user.gravatarEmail = vm.gravatarEmail ?? user.gravatarEmail;
  user.tags = vm.tags ?? user.tags;
  user.tenants = vm.tenants ?? user.tenants;
  user.notes = vm.notes ?? user.notes;
  return user;
}
export function convertNotificationFormToUser(vm: UserNotificationFormModel, user?: UserModel): UserModel {
  if (!user) die('user.util.convertNotificationFormToUser: User is mandatory.');
  user.newsDelivery = vm.newsDelivery ?? user.newsDelivery;
  user.invoiceDelivery = vm.invoiceDelivery ?? user.invoiceDelivery;
  return user;
}
export function convertPrivacyFormToUser(vm: UserPrivacyFormModel, user?: UserModel): UserModel {
  if (!user) die('user.util.convertPrivacyFormToUser: User is mandatory.');
  user.usage_images = vm.usage_images ?? user.usage_images;
  user.usage_dateOfBirth = vm.usage_dateOfBirth ?? user.usage_dateOfBirth;
  user.usage_postalAddress = vm.usage_postalAddress ?? user.usage_postalAddress;
  user.usage_email = vm.usage_email ?? user.usage_email;
  user.usage_phone = vm.usage_phone ?? user.usage_phone;
  user.usage_name = vm.usage_name ?? user.usage_name;
  return user;
}

export function isUser(user: unknown, tenantId: string): user is UserModel {
  return isType(user, new UserModel(tenantId));
}


/*------------------------------index ---------------------------*/
export function getUserIndex(model: UserModel): string {
  return `l:${model.loginEmail} p:${model.personKey}`;
}

export function getUserIndexInfo(): string {
  return 'l:loginEmail p:personKey';
}