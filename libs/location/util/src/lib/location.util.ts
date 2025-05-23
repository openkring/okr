import { LocationModel, LocationType } from "@bk2/shared/models";
import { LocationFormModel } from "./location-form.model";
import { isType } from '@bk2/shared/util';

export function getLocationTitle(locationKey: string | undefined): string {
  const _operation = !locationKey ? 'create' : 'update';
  return `@location.operation.${_operation}.label`;  
}

export function newLocationFormModel(): LocationFormModel {
  return {
    bkey: '',
    name: '',
    tags: '',
    address: '',
    type: LocationType.Address,
    latitude: '0',
    longitude: '0',
    placeId: '',
    what3words: '',
    seaLevel: 0,
    speed: 0,
    direction: 0,
    notes: '',
  }
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
    tags: location.tags
  }
}

export function convertFormToLocation(location: LocationModel | undefined, vm: LocationFormModel, tenantId: string): LocationModel {
  location ??= new LocationModel(tenantId);
  location.bkey = vm.bkey ?? ''; 
  location.name = vm.name ?? '';
  location.address = vm.address ?? '';
  location.type = vm.type ?? LocationType.Address;
  location.latitude = parseFloat(vm.latitude ?? '0');
  location.longitude = parseFloat(vm.longitude ?? '0');
  location.placeId = vm.placeId ?? '';
  location.what3words = vm.what3words ?? '';
  location.seaLevel = vm.seaLevel ?? 0;
  location.speed = vm.speed ?? 0;
  location.direction = vm.direction ?? 0;
  location.tags = vm.tags ?? '';
  location.notes = vm.notes ?? '';
  return location;
}

export function isLocation(location: unknown, tenantId: string): location is LocationModel {
  return isType(location, new LocationModel(tenantId));
}





