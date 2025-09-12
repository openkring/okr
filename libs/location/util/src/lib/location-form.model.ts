
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { LocationType } from '@bk2/shared-models';

export type LocationFormModel = DeepPartial<{
  bkey: string,
  // tenants
  // isArchived
  // index
  name: string,
  tags: string,
  address: string,
  type: LocationType,
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
  bkey: '',
  name: '',
  tags: '',
  address: '',
  type: LocationType.Address,
  latitude: '',
  longitude: '',
  placeId: '',
  what3words: '',
  seaLevel: 0,
  speed: 0,
  direction: 0,
  notes: '',
};