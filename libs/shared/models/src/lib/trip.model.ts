import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME } from '@okr/shared-constants';
import { OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';
import { TransportMode } from './page.model';

/** `trip_type` value of private recorded tracks (tracker, spec 1.121). Readable/writable by the owner only. */
export const TRACKER_TRIP_TYPE = 'tracker';
/** Every trip_type except tracker — the `in` filter every non-tracker trips query must carry (rules, design §4). */
export const NON_TRACKER_TRIP_TYPES = ['', 'logbuch', 'private', 'travel'];

export type TrackMode = TransportMode;

export interface TripTrack {
  personKey: string; // owner — the same person in every tenant
  ownerUid: string; // the uid that recorded (for Storage paths and audits)
  startedAt: string; // ISO timestamp (UTC), exact
  endedAt: string;
  durationS: number;
  sections: TrackSection[];
  photos: TrackPhoto[];
  journalKey?: string; // set when attached to a journal
  footprintKey?: string;
  role?: 'leg' | 'tour'; // leg = route to footprintKey; tour = a tour shown inside footprintKey
}

export interface TrackSection {
  mode: TrackMode;
  detected: boolean; // false once the owner corrected it
  startedAt: string;
  endedAt: string;
  distanceM: number;
  pointsPath: string; // Storage path of the encoded points
}

export interface TrackPhoto {
  assetId: string; // PhotoKit local identifier on the recording device
  takenAt: string;
  lat: number;
  lng: number; // own GPS, else interpolated from the track at takenAt
  hidden: boolean;
  imageKey?: string; // JournalImageModel okey when attached to a journal
  thumbPath?: string; // 400 px thumbnail in the private bucket otherwise
}

export class TripModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME; // a meaningful name for the trip
  public type = ''; // trip type / list partition (a `trip_type` category value, e.g. 'logbuch')
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES; // a detailed description of the trip
  public startDate = DEFAULT_DATE; // date when the trip starts
  public startTime = DEFAULT_TIME; // time when the trip starts
  public endDate = DEFAULT_DATE; // date when the trip ends
  public endTime = DEFAULT_TIME; // time when the trip ends
  public resource?: AvatarInfo; // resource.okey: the resource used for the trip
  public locations: AvatarInfo[] = []; // location.okey: the locations visited during the trip, ordered by visit
  public customLocationLabel: string = '';
  public distance: number = 0; // calculated or manual with other locaiton
  public participants: AvatarInfo[] = []; // person.okey: the persons participating in the trip
  public state = 'draft';
  public track?: TripTrack; // recorded track metadata (type 'tracker'); not initialised — legacy trips lack it
  
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
