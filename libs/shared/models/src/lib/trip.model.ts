import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class TripModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME; // a meaningful name for the trip
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES; // a detailed description of the trip
  public startDate = DEFAULT_DATE; // date when the trip starts
  public startTime = DEFAULT_TIME; // time when the trip starts
  public endDate = DEFAULT_DATE; // date when the trip ends
  public endTime = DEFAULT_TIME; // time when the trip ends
  public resourceKey = DEFAULT_KEY; // resource.bkey: the resource used for the trip
  public locations: string[] = []; // location.bkey: the locations visited during the trip, ordered by visit
  public persons: string[] = []; // person.bkey: the persons participating in the trip

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TripCollection = 'trips';
