import { LocationModel } from '@bk2/shared-models';
import { isType } from '@bk2/shared-util-core';

import { LocationFormModel } from './location-form.model';
import { DEFAULT_KEY, DEFAULT_LOCATION_TYPE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

export function getLocationTitle(locationKey: string | undefined): string {
  const _operation = !locationKey ? 'create' : 'update';
  return `@location.operation.${_operation}.label`;
}

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

export function convertFormToLocation(location: LocationModel | undefined, vm: LocationFormModel, tenantId: string): LocationModel {
  location ??= new LocationModel(tenantId);
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
