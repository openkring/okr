import { DeepRequired } from 'ngx-vest-forms';

import { BaseProperty, CarType, GenderType, ResourceType, RowingBoatType, RowingBoatUsage } from '@bk2/shared-models';

// can not use the DeepPartial from ngx-vest-forms because it is not compatible with BaseProperty[].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeepPartial<T> = T extends any[]? T : T extends Record<string, any> ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

export type ResourceFormModel = DeepPartial<{
  bkey: string,
  name: string,
  keyNr: number,
  lockerNr: number,
  type: ResourceType,      
  gender: GenderType,       // Locker
  rowingBoatType: RowingBoatType,  // RowingBoat
  carType: CarType,       // Car
  usage: RowingBoatUsage,   // RowingBoat
  currentValue: number,
  weight: number,
  load: string,
  brand: string,
  model: string,
  serialNumber: string,
  seats: number,
  length: number,
  width: number,
  height: number,
  hexColor: string,
  data: BaseProperty[],
  description: string,
  tags: string,
}>;

export const resourceFormShape: DeepRequired<ResourceFormModel> = {
  bkey: '',
  name: '',
  keyNr: 0,
  lockerNr: 0,
  type: ResourceType.RowingBoat,
  gender: GenderType.Male,
  rowingBoatType: RowingBoatType.b1x,
  carType: CarType.Sedan,
  usage: RowingBoatUsage.Breitensport,
  currentValue: 0,
  weight: 0,
  load: '',
  brand: '',
  model: '',
  serialNumber: '',
  seats: 0,
  length: 0,
  width: 0,
  height: 0,
  hexColor: '',
  data: [],
  description: '',
  tags: '',
};