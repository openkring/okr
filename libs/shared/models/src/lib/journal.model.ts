import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@okr/shared-constants';
import { OkrModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';
import { ImageConfig } from './image.model';

/**
 * A travel journal (spec 1.113): co-edited by its authors on their iPads, offline-first, read and
 * commented by invited guests. Its footprints are CMS pages of type 'footprint' (see FOOTPRINT_PAGE_TYPE).
 */
export type JournalState = 'draft' | 'active' | 'closed';

/** A guest is a person. Their personal link lives in JournalGuestLinks, never on the journal document. */
export interface JournalGuest {
  person: AvatarInfo;
}

/**
 * The personal links of a journal's guests, at `journals/{okey}/private/guestLinks` — readable by the
 * journal's authors only. Guests can read the journal document, and Firestore rules cannot hide a
 * single field, so a link code on the journal would let every guest sign in as every other guest.
 * `linkCode` is a random 128-bit code; setting `revokedAt` ends that guest's access.
 */
export interface JournalGuestLink {
  personKey: string;
  linkCode: string;
  revokedAt?: string;
}

export interface JournalGuestLinks {
  links: JournalGuestLink[];
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
export const JournalPrivateCollection = 'private'; // subcollection, authors only: docs 'peer' and 'guestLinks'
export const JournalGuestLinksDoc = 'guestLinks';
export const JournalPeerDoc = 'peer';
export const JournalModelName = 'journal';
