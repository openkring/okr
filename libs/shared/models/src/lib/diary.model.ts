import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { OkrModel, SearchableModel, TaggedModel } from './base.model';

/** A diary entry is a draft until it is complete — which includes having real weather data. */
export type DiaryStatus = 'draft' | 'final';

/**
 * Measured weather for the day, from Open-Meteo. Never derived from the text, never guessed.
 * `code` is the WMO weather code; -1 means "not fetched yet", which keeps the entry a draft.
 */
export interface DiaryWeather {
  code: number;
  min: number;
  max: number;
  precip: number;
  /** local time 'HH:mm' */
  sunrise: string;
  /** local time 'HH:mm' */
  sunset: string;
}

export const DEFAULT_DIARY_WEATHER: DiaryWeather = {
  code: -1,
  min: 0,
  max: 0,
  precip: 0,
  sunrise: '',
  sunset: '',
};

export class DiaryModel implements OkrModel, TaggedModel, SearchableModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  /** Firebase uid of the author. The Firestore rule allows read and write to this uid only. */
  public authorKey = DEFAULT_KEY;
  /** DateFormat.StoreDate ('yyyyMMdd'). Unique per (authorKey, tenant). */
  public date = DEFAULT_DATE;
  public title = DEFAULT_NAME;
  /** the body of the entry — rendered as '## Persönliche Gedanken' */
  public text = '';
  /** completed todos — rendered as '## Erledigt' */
  public done: string[] = [];
  public status: DiaryStatus = 'draft';

  /** resolved location; absent when only customLocationLabel is known */
  public location?: AvatarInfo;
  /** free text location, used when no locations entry matches (pattern: TripModel) */
  public customLocationLabel = '';
  /** resolved persons */
  public people: AvatarInfo[] = [];
  /** slugs of persons that have no persons entry (pattern: TripModel) */
  public customPeopleLabels: string[] = [];
  /** place slugs — not resolved to locations */
  public places: string[] = [];
  /** recurring event labels ('weihnachten', 'ostern') — a tag vocabulary, not calevents */
  public events: string[] = [];
  /** trips.okey of a TripModel with type 'travel' */
  public tripKey = DEFAULT_KEY;

  public weather: DiaryWeather = { ...DEFAULT_DIARY_WEATHER };
  /** Google Drive id of the day folder — stable across folder renames */
  public driveFolderId = '';
  /** file names of the media in the day folder */
  public media: string[] = [];

  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const DiaryCollection = 'diaries';
export const DiaryModelName = 'diary';
