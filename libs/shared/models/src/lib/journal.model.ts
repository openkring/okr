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
 * `linkCode` is a random 128-bit code; setting `revokedAt` ends that guest's access, and so does passing
 * `expiresAt`. `mutedAt` is set when the guest mutes the journal: no notifications while it is set (plan 7,
 * approved 2026-10-24).
 */
export interface JournalGuestLink {
  personKey: string;
  linkCode: string;
  revokedAt?: string; // ISO timestamp
  expiresAt?: string; // ISO timestamp; the link stops working after it
  mutedAt?: string; // ISO timestamp; no notifications while set
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
  public authorKeys: string[] = []; // person.okey of every author — for rules and array-contains queries
  public guests: JournalGuest[] = []; // persons who may read, comment and like
  public signalSender?: string; // person.okey of the author whose Matrix account is logged into the Signal bridge
  public state: JournalState = 'draft';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

/**
 * An image of a journal as the web story and guests read it (spec 1.113 §3), at
 * `journals/{journalKey}/images/{okey}`, written by the applyJournalChange function only.
 * `path2048`/`path400` are Storage paths in the private bucket, read through signed URLs.
 */
export interface JournalImageModel {
  okey: string;
  tenants: string[];
  isArchived: boolean;
  journalKey: string;
  authorKey: string;
  takenAt?: string; // ISO local time from EXIF
  latitude?: number;
  longitude?: number;
  width: number;
  height: number;
  path2048: string;
  path400: string;
}

export const JournalCollection = 'journals';
// Subcollections of journals/{okey}, written by the applyJournalChange function only (plan 4): the journal's
// footprints (PageModel, type 'footprint'), blocks (sections) and images. Kept under the journal so read rules
// can be scoped to its authors and guests without touching the CMS 'pages'/'sections' queries.
export const JournalFootprintCollection = 'footprints';
export const JournalSectionCollection = 'sections';
export const JournalImageCollection = 'images';
export const JournalCommentCollection = 'comments'; // CommentModel shape, parentKey 'page.<footprintKey>'
export const JournalReactionCollection = 'reactions'; // ReactionModel shape, id reactionKey(parentKey, personKey)
export const JournalLockCollection = 'journal-locks'; // ephemeral edit locks, doc id `${journalKey}_${entityKey}` (1.126 §6.2)
export const JournalPrivateCollection = 'private'; // subcollection, authors only: docs 'peer' and 'guestLinks'
export const JournalGuestLinksDoc = 'guestLinks';
export const JournalPeerDoc = 'peer';
export const JournalNotifyDoc = 'notify'; // private: { lastNotifiedAt } — the digest cursor (plan 7)
export const JournalGuestSeqDoc = 'guestSeq'; // private: per guest the last seq of their change records
export const JournalSignalRoomsDoc = 'signalRooms'; // private: personKey → Signal portal room id
export const JournalModelName = 'journal';

/**
 * The travel book of a journal (spec 1.113 phase 2 §6): one document per journal at `journal-books/{journalKey}`,
 * read and written by the journal's authors only. `export` and `prints` are also written by the exportJournalBook
 * function (Admin SDK). Image ids are the journal image entity keys (`ImageView.key`, `journals/{jk}/images`).
 */
export type BookTemplate = 'full' | 'two-portrait' | 'two-landscape' | 'hero-2' | 'hero-3';

/** A hand-set page of an album block: which template, which photos. */
export interface BookPageOverride {
  template: BookTemplate;
  imageKeys: string[];
}

export interface JournalBookPrint {
  bleedMm: number;
  pageMultiple: number;
  iccProfile: 'fogra39';
  cover: 'none' | 'softcover' | 'hardcover';
  spineMm?: number;
  wrapMm?: number;
}

/** The last export, written by the function only (rules forbid the client to touch it). */
export interface JournalBookExport {
  kind: 'print' | 'screen';
  state: 'running' | 'done' | 'failed';
  progress?: number;
  startedAt: string; // ISO timestamp
  finishedAt?: string; // ISO timestamp
  bookPath?: string; // Storage path in the private bucket
  coverPath?: string;
  pageCount?: number;
  warnings?: number;
  error?: string;
}

export class JournalBookModel {
  public okey = DEFAULT_KEY; // = journalKey
  public tenants = DEFAULT_TENANTS;
  public title?: string; // overrides the journal's title
  public subTitle?: string;
  public coverImageKey?: string; // always one of the journal's images
  public hiddenImageKeys: string[] = []; // photos left out of the book
  public fitWhole: string[] = []; // imageKeys shown «ganz zeigen»
  public footprints: Record<string, { showComments: boolean; commentKeys: string[] }> = {}; // by footprint (page) key
  public albums: Record<string, { pages: BookPageOverride[] }> = {}; // by album section key
  public prints: Record<string, { width: number; height: number }> = {}; // uploaded print photos by imageKey
  public print: JournalBookPrint = { bleedMm: 3, pageMultiple: 4, iccProfile: 'fogra39', cover: 'none' };
  public export?: JournalBookExport;
  public updatedAt = ''; // ISO timestamp
  public updatedBy = ''; // person key
}

export const JournalBookCollection = 'journal-books';
