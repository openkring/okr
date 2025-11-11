
import { DEFAULT_KEY, DEFAULT_LOCATION_TYPE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type LocationFormModel = DeepPartial<{
  bkey: string,
  // tenants
  // isArchived
  // index
  name: string,
  tags: string,
  address: string,
  type: string,
  latitude: string,
  longitude: string,
  placeId: string,
  what3words: string,
  seaLevel: number,
  speed: number,
  direction: number,
  notes: string,
}>;

export const locationFormModelShape: DeepRequired<LocationFormModel> = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  tags: DEFAULT_TAGS,
  address: '',
  type: DEFAULT_LOCATION_TYPE,
  latitude: '',
  longitude: '',
  placeId: '',
  what3words: '',
  seaLevel: 0,
  speed: 0,
  direction: 0,
  notes: DEFAULT_NOTES,
};