import { LocationModel } from '@bk2/shared-models';
import { die, isType } from '@bk2/shared-util-core';

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