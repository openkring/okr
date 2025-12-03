import { BaseProperty } from '@bk2/shared-models';
import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_RBOAT_TYPE, DEFAULT_RBOAT_USAGE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS } from '@bk2/shared-constants';

export type ResourceFormModel = {
  bkey: string,
  name: string,
  keyNr: number,
  lockerNr: number,
  type: string,      
  subType: string,       // rboat, car, gender (locker)
  usage: string,   // rboat
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
};

export const RESOURCE_FORM_SHAPE: ResourceFormModel = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  keyNr: 0,
  lockerNr: 0,
  type: DEFAULT_RESOURCE_TYPE,
  subType: DEFAULT_RBOAT_TYPE,
  usage: DEFAULT_RBOAT_USAGE,
  currentValue: DEFAULT_PRICE,
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
  description: DEFAULT_NOTES,
  tags: DEFAULT_TAGS,
};