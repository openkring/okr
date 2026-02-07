import { DEFAULT_CONTENT_STATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PAGE_TYPE, DEFAULT_SECTIONS, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@bk2/shared-constants';
import { BkModel, MetaTag, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class PageModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
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
  public sections = DEFAULT_SECTIONS; // section.bkey, section.name
  public isPrivate = true; // if true, page requires authentication and should not be accessible via /public/ routes

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PageCollection = 'pages';
export const PageModelName = 'page';
