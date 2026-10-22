import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { OkrModel, SearchableModel } from './base.model';

/** What an album is built around. Tags and trips are filters only and have no album document. */
export type DiaryAlbumKind = 'person' | 'location' | 'event';

/**
 * A personal, per-author collection of diary entries around one person, location or event.
 * The document id is deterministic (`tenant__author__kind__ref`), see `diaryAlbumId`.
 */
export class DiaryAlbumModel implements OkrModel, SearchableModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  /** Firebase uid of the author. */
  public authorKey = DEFAULT_KEY;
  public kind: DiaryAlbumKind = 'person';
  public title = DEFAULT_NAME;
  /** resolved person or location; person/location albums only */
  public ref?: AvatarInfo;
  /** event slug; event albums only */
  public slug = '';
  public notes = '';
  public index = DEFAULT_INDEX;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const DiaryAlbumCollection = 'diaryAlbums';
export const DiaryAlbumModelName = 'diaryAlbum';
