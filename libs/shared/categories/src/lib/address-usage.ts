import { AddressUsage, CategoryModel } from '@bk2/shared-models';

export type AddressUsageCategory = CategoryModel; 

export const AddressUsages: AddressUsageCategory[] = [{
  id: AddressUsage.Home,
  abbreviation: 'HOME',
  name: 'home',
  i18nBase: 'subject.address.usage.home',
  icon: 'home'
},
{
  id: AddressUsage.Work,
  abbreviation: 'WORK',
  name: 'work',
  i18nBase: 'subject.address.usage.work',
  icon: 'work'
},
{
  id: AddressUsage.Mobile,
  abbreviation: 'MOB',
  name: 'mobile',
  i18nBase: 'subject.address.usage.mobile',
  icon: 'tel'
},
{
  id: AddressUsage.Custom,
  abbreviation: 'CSTM',
  name: 'custom',
  i18nBase: 'subject.address.usage.custom',
  icon: 'edit'
}
]
