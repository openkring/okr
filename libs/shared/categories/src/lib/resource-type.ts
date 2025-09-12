import { CategoryModel, ResourceType } from '@bk2/shared-models';

export type ResourceTypeCategory = CategoryModel;

export const ResourceTypes: ResourceTypeCategory[] = [
  {
    id: ResourceType.RowingBoat,
    abbreviation: 'ROWB',
    name: 'rowingBoat',
    i18nBase: 'resource.type.rowingBoat',
    icon: 'rowing_8x_front'
  },
  {
    id: ResourceType.Boat,
    abbreviation: 'BOAT',
    name: 'motorBoat',
    i18nBase: 'resource.type.boat',
    icon: 'boat'
  },
  {
    id: ResourceType.Car,
    abbreviation: 'CAR',
    name: 'vehicle',
    i18nBase: 'resource.type.car',
    icon: 'car'
  },
  {
    id: ResourceType.Locker,
    abbreviation: 'LOKR',
    name: 'locker',
    i18nBase: 'resource.type.locker',
    icon: 'lock-closed'
  },
  {
    id: ResourceType.Key,
    abbreviation: 'KEY',
    name: 'key',
    i18nBase: 'resource.type.key',
    icon: 'resource_key'
  },
  {
    id: ResourceType.RealEstate,
    abbreviation: 'RE',
    name: 'realEstate',
    i18nBase: 'resource.type.realEstate',
    icon: 'home'
  },
  {
    id: ResourceType.Other,
    abbreviation: 'OTHR',
    name: 'other',
    i18nBase: 'resource.type.other',
    icon: 'other'
  }
]
