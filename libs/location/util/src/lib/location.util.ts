import { LocationModel } from '@bk2/shared-models';
import { die, isType } from '@bk2/shared-util-core';

import { LocationFormModel } from './location-form.model';
import { DEFAULT_KEY, DEFAULT_LOCATION_TYPE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

export function newLocationFormModel(): LocationFormModel {
  return {
    bkey: DEFAULT_KEY,
    name: DEFAULT_NAME,
    tags: DEFAULT_TAGS,
    address: '',
    type: DEFAULT_LOCATION_TYPE,
    latitude: '0',
    longitude: '0',
    placeId: '',
    what3words: '',
    seaLevel: 0,
    speed: 0,
    direction: 0,
    notes: DEFAULT_NOTES,
  };
}

export function convertLocationToForm(location: LocationModel | undefined): LocationFormModel {
  if (!location) return newLocationFormModel();
  return {
    bkey: location.bkey,
    name: location.name,
    address: location.address,
    type: location.type,
    latitude: location.latitude + '',
    longitude: location.longitude + '',
    placeId: location.placeId,
    what3words: location.what3words,
    seaLevel: location.seaLevel,
    speed: location.speed,
    direction: location.direction,
    notes: location.notes,
    tags: location.tags,
  };
}

export function convertFormToLocation(vm?: LocationFormModel, location?: LocationModel): LocationModel {
  if (!location) die('location.util.convertFormToLocation: location is mandatory.');
  if (!vm) return location;
  
  location.bkey = vm.bkey ?? DEFAULT_KEY;
  location.name = vm.name ?? DEFAULT_NAME;
  location.address = vm.address ?? '';
  location.type = vm.type ?? DEFAULT_LOCATION_TYPE;
  location.latitude = parseFloat(vm.latitude ?? '0');
  location.longitude = parseFloat(vm.longitude ?? '0');
  location.placeId = vm.placeId ?? '';
  location.what3words = vm.what3words ?? '';
  location.seaLevel = vm.seaLevel ?? 0;
  location.speed = vm.speed ?? 0;
  location.direction = vm.direction ?? 0;
  location.tags = vm.tags ?? DEFAULT_TAGS;
  location.notes = vm.notes ?? DEFAULT_NOTES;
  return location;
}

export function isLocation(location: unknown, tenantId: string): location is LocationModel {
  return isType(location, new LocationModel(tenantId));
}


/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given person based on its values.
 * @param person the person for which to create the index
 * @returns the index string
 */
export function getLocationIndex(location: LocationModel): string {
  return 'n:' + location.name + ' w:' + location.what3words;
}

export function getLocationIndexInfo(): string {
  return 'n:ame w:hat3words';
}