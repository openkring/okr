import { CategoryModel, RoleEnum } from '@bk2/shared-models';

export type RoleEnumCategory = CategoryModel;

export const RoleEnums: RoleEnumCategory[] = [
  {
    id: RoleEnum.None,
    abbreviation: 'NONE',
    name: 'none',
    i18nBase: 'auth.roles.none',
    icon: 'close_cancel',
  },
  {
    id: RoleEnum.Anonymous,
    abbreviation: 'ANON',
    name: 'anonymous',
    i18nBase: 'auth.roles.anonymous',
    icon: 'person-remove',
  },
  {
    id: RoleEnum.Registered,
    abbreviation: 'REG',
    name: 'registered',
    i18nBase: 'auth.roles.registered',
    icon: 'person',
  },
  {
    id: RoleEnum.Privileged,
    abbreviation: 'PRIV',
    name: 'privileged',
    i18nBase: 'auth.roles.privileged',
    icon: 'person-add',
  },
  {
    id: RoleEnum.ContentAdmin,
    abbreviation: 'CA',
    name: 'contentAdmin',
    i18nBase: 'auth.roles.contentAdmin',
    icon: 'documents',
  },
  {
    id: RoleEnum.ResourceAdmin,
    abbreviation: 'RA',
    name: 'resourceAdmin',
    i18nBase: 'auth.roles.resourceAdmin',
    icon: 'resource_tool',
  },
  {
    id: RoleEnum.MemberAdmin,
    abbreviation: 'MA',
    name: 'memberAdmin',
    i18nBase: 'auth.roles.memberAdmin',
    icon: 'membership',
  },
  {
    id: RoleEnum.EventAdmin,
    abbreviation: 'EA',
    name: 'eventAdmin',
    i18nBase: 'auth.roles.eventAdmin',
    icon: 'calendar-number',
  },
  {
    id: RoleEnum.Treasurer,
    abbreviation: 'TRSR',
    name: 'treasurer',
    i18nBase: 'auth.roles.treasurer',
    icon: 'finance_money_bag',
  },
  {
    id: RoleEnum.Admin,
    abbreviation: 'ADM',
    name: 'admin',
    i18nBase: 'auth.roles.admin',
    icon: 'admin',
  },
  {
    id: RoleEnum.Public,
    abbreviation: 'PBL',
    name: 'public',
    i18nBase: 'auth.roles.public',
    icon: 'lock-open',
  },
];
