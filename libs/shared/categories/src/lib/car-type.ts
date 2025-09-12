import { CarType, CategoryModel } from '@bk2/shared-models';


export type CarTypeCategory = CategoryModel;

export const CarTypes: CarTypeCategory[] = [
  {
    id: CarType.Convertible,
    abbreviation: 'CONV',
    name: 'convertible',
    i18nBase: 'car.type.convertible',
    icon: 'car'
  },
  {
    id: CarType.Coupe,
    abbreviation: 'COUP',
    name: 'coupe',
    i18nBase: 'car.type.coupe',
    icon: 'car'
  },
  {
    id: CarType.StationWagon,
    abbreviation: 'STWG',
    name: 'stationWagon',
    i18nBase: 'car.type.stationWagon',
    icon: 'car'
  },
  {
    id: CarType.Suv,
    abbreviation: 'SUV',
    name: 'suv',
    i18nBase: 'car.type.suv',
    icon: 'car'
  },
  {
    id: CarType.Sedan,
    abbreviation: 'SDN',
    name: 'sedan',
    i18nBase: 'car.type.sedan',
    icon: 'car'
  },
  {
    id: CarType.Hatchback,
    abbreviation: 'HTCH',
    name: 'hatchback',
    i18nBase: 'car.type.hatchback',
    icon: 'car'
  },
  {
    id: CarType.MiniVan,
    abbreviation: 'MVAN',
    name: 'minivan',
    i18nBase: 'car.type.minivan',
    icon: 'car'
  },
  {
    id: CarType.Truck,
    abbreviation: 'TRCK',
    name: 'truck',
    i18nBase: 'car.type.truck',
    icon: 'car'
  },
  {
    id: CarType.PickupTruck,
    abbreviation: 'PTRK',
    name: 'pickupTruck',
    i18nBase: 'car.type.pickupTruck',
    icon: 'car'
  },
  {
    id: CarType.SportsCar,
    abbreviation: 'SCAR',
    name: 'sportsCar',
    i18nBase: 'car.type.sportsCar',
    icon: 'car'
  },
  {
    id: CarType.Utility,
    abbreviation: 'UTIL',
    name: 'utility',
    i18nBase: 'car.type.utility',
    icon: 'car'
  },
  {
    id: CarType.Camper,
    abbreviation: 'CAMP',
    name: 'camper',
    i18nBase: 'car.type.camper',
    icon: 'car'
  },
  {
    id: CarType.Bus,
    abbreviation: 'BUS',
    name: 'bus',
    i18nBase: 'car.type.bus',
    icon: 'car'
  }
]