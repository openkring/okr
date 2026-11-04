import { AvatarInfo, LocationModel } from '@okr/shared-models';

/** What a reader needs of a calevent. `locations` is absent on documents older than the field. */
type HasLocations = { locations?: AvatarInfo[] };

/** The avatar of a predefined location, keyed by its okey. */
export function locationToAvatar(location: Pick<LocationModel, 'okey' | 'name' | 'type'>): AvatarInfo {
  return { key: location.okey, name1: location.name, name2: '', label: location.name, modelType: 'location', type: location.type ?? '', subType: '' };
}

/** A location without a `locations` document (key ''). The text is kept as typed: the form feeds it back on every key. */
export function freeTextLocationAvatar(text: string): AvatarInfo {
  return { key: '', name1: text, name2: '', label: text, modelType: 'location', type: '', subType: '' };
}

/**
 * A position, as coordinates. Not an address: reverse geocoding would send the member's position
 * to Google Maps, which is not on the processor register (see the `privacy-model` skill).
 */
export function positionToLocationAvatar(latitude: number, longitude: number): AvatarInfo {
  return freeTextLocationAvatar(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
}

/** The readable place of an event: the first of its locations, '' when there is none. */
export function getEventLocationName(event?: HasLocations): string {
  const location = event?.locations?.[0];
  return location?.label || location?.name1 || location?.name2 || '';
}

/** The okey of an event's location, '' when there is none or it is free text. */
export function getEventLocationKey(event?: HasLocations): string {
  return event?.locations?.[0]?.key ?? '';
}
