import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@okr/shared-constants';
import { OkrModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';
import { ImageConfig } from './image.model';

/**
 * A travel journal (spec 1.113): co-edited by its authors on their iPads, offline-first, read and
 * commented by invited guests. Its footprints are CMS pages of type 'footprint' (see FOOTPRINT_PAGE_TYPE).
 */
export type JournalState = 'draft' | 'active' | 'closed';

/**
 * A guest is a person. `linkCode` is the random 128-bit code in the guest's personal link; it is
 * readable by the journal's authors only. Setting `revokedAt` ends the guest's access.
 */
export interface JournalGuest {
  person: AvatarInfo;
  linkCode: string;
  revokedAt?: string;
}

export class JournalModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;
  public title = DEFAULT_TITLE; // e.g. «Antarktis 2027»
  public subTitle = DEFAULT_TITLE;
  public cover?: ImageConfig;
  public startDate = DEFAULT_DATE; // StoreDate
  public endDate = DEFAULT_DATE; // StoreDate
  public tripKey?: string; // FK -> trips, optional
  public authors: AvatarInfo[] = []; // persons who may write
  public guests: JournalGuest[] = []; // persons who may read, comment and like
  public signalSender?: string; // person.okey of the author whose Matrix account is logged into the Signal bridge
  public state: JournalState = 'draft';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const JournalCollection = 'journals';
export const JournalModelName = 'journal';
