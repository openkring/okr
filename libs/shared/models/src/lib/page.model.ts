import { DEFAULT_BLOG_TYPE, DEFAULT_CONTENT_STATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PAGE_TYPE, DEFAULT_SECTIONS, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@okr/shared-constants';
import { OkrModel, MetaTag, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { DiaryWeather } from './diary.model';
import type { EmailLayoutChoice } from './pdf-template.model';

export type BlogLayoutType = 'minimal' | 'grid' | 'classic' | 'magazine' | 'bento' | 'stream';
export const DEFAULT_BLOG_LAYOUT_TYPE: BlogLayoutType = DEFAULT_BLOG_TYPE;

export class PageModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME; // a meaningful name for the trip
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public title = DEFAULT_TITLE; // used for SEO
  public subTitle = DEFAULT_TITLE; 
  public abstract = ''; // short description, used on landing and error pages
  public logoUrl = ''; // URL to the logo image, used on landing and error pages
  public logoAltText = ''; // alt text for the logo image
  public bannerUrl = ''; // URL to the welcome banner image, used on landing page (often a hero image or background image)
  public bannerAltText = ''; // alt text for the banner image
  public meta?: MetaTag[] = []; // meta tags for SEO
  public type = DEFAULT_PAGE_TYPE;
  public state = DEFAULT_CONTENT_STATE; // the state of the page
  public notes = DEFAULT_NOTES; // a detailed description of the trip
  public sections = DEFAULT_SECTIONS; // section.okey, section.name
  public isPrivate = true; // if true, page requires authentication and should not be accessible via /public/ routes
  public blogType: BlogLayoutType = DEFAULT_BLOG_LAYOUT_TYPE; // layout type for blog pages
  public locationKey = ''; // FK -> locations; the page's location, inherited by weather sections

  // travel-journal footprint fields (spec 1.113 §3.2), only used when type === FOOTPRINT_PAGE_TYPE.
  // Optional on read: every page written before them returns undefined.
  public journalKey?: string; // FK -> journals
  public date?: string; // StoreDate, local ship time
  public time?: string; // StoreTime, local ship time
  public latitude?: number;
  public longitude?: number;
  public placeName?: string; // e.g. «Neko Harbour»
  public weather?: DiaryWeather; // filled when the footprint is first online
  public publishState?: FootprintPublishState;
  public transport?: TransportMode; // how the travellers got TO this footprint (flyover, phase 2; approved 2026-10-24)
  public notifyGuests?: boolean; // the author's choice at publish time
  public notifiedAt?: string; // ISO timestamp; makes the guest notification idempotent

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export type FootprintPublishState = 'draft' | 'published';
export type TransportMode = 'plane' | 'ship' | 'bus' | 'train' | 'car' | 'bike' | 'foot' | 'row' | 'ski' | 'motorbike';
export const TRANSPORT_MODES: TransportMode[] = ['plane', 'ship', 'bus', 'train', 'car', 'bike', 'foot', 'row', 'ski', 'motorbike'];
export const FOOTPRINT_PAGE_TYPE = 'footprint';

// Versand als Seite (spec 1.172): a mail built from CMS-style sections, stored apart from the website pages.
export const MAIL_PAGE_TYPE = 'mail';
export const MailPageCollection = 'mailPages';
export const MailPageSectionCollection = 'sections'; // subcollection mailPages/{key}/sections
export const MailingWebCollection = 'mailingWeb'; // server-only snapshot of a sent Versand, served by a function by token
export const MAIL_SECTION_TYPES = ['article', 'button', 'events'] as const;
export type MailSectionType = (typeof MAIL_SECTION_TYPES)[number];

export class MailPageModel extends PageModel {
  public senderUid = ''; // FK -> users; the author of the Versand
  public groupKey?: string; // FK -> groups; the newsletter group, if any
  public mailingKey?: string; // FK -> mailings; set once the Versand was sent
  public createdAt = ''; // ISO timestamp
  public subject?: string; // the subject line of the Versand
  public layout?: EmailLayoutChoice; // the e-mail layout; absent = the tenant's default
  public webVersion?: boolean; // offer «im Browser ansehen»
  public changedAt?: string; // ISO timestamp of the last edit

  constructor(tenantId: string) {
    super(tenantId);
    this.type = MAIL_PAGE_TYPE;
  }
}

export const PageCollection = 'pages';
export const PageModelName = 'page';
