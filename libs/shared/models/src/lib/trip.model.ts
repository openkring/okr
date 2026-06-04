import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';

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
  public resource?: AvatarInfo; // resource.bkey: the resource used for the trip
  public locations: string[] = []; // location.bkey: the locations visited during the trip, ordered by visit
  public customLocationLabel: string = '';
  public distance: number = 0; // calculated or manual with other locaiton
  public participants: AvatarInfo[] = []; // person.bkey: the persons participating in the trip
  public state = 'draft';
  
  // soft delete pattern
  public deletedAt?: string | null;      // ISO timestamp, null = active
  public deletedBy?: string | null;     // optional: device id, station name, or admin who deleted
  public flagged?: boolean;             // set by suspicious activity detection

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TripCollection = 'trips';
export const TripModelName = 'trip';
