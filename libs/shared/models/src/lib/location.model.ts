import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { LocationType } from './enums/location-type.enum';

export class LocationModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public name = ''; // a meaningful name for the location
  public tags = '';
  public address = ''; // from google places
  public type: LocationType = LocationType.Address;
  public latitude = 0;
  public longitude = 0;
  public placeId = '';
  public what3words = '';
  public seaLevel = 406; // meters above sea level
  public speed = 0; // m/s
  public direction = 0; // degrees
  public notes = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const LocationCollection = 'locations';
