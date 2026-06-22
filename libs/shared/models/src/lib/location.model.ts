import { DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LOCATION_TYPE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class LocationModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public name = DEFAULT_NAME; // a meaningful name for the location
  public address = ''; // human-readable postal address (e.g. from geocoding)
  public tags = DEFAULT_TAGS;
  public type = DEFAULT_LOCATION_TYPE;
  public latitude = 0;
  public longitude = 0;
  public placeId = DEFAULT_ID;
  public what3words = '';
  public seaLevel = 0; // meters above sea level
  public speed = 0; // m/s
  public direction = 0; // degrees
  public distance = 0; // distance in km from a given point
  public notes = DEFAULT_NOTES;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const LocationCollection = 'locations';
export const LocationModelName = 'location';
