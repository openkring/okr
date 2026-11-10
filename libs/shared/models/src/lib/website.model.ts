import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';
import { I18nString } from './i18n.model';

export type WebsiteNodeType = 'menu' | 'page' | 'link';

export interface WebsiteNode {
  id: string; // random, stable within the site
  type: WebsiteNodeType;
  label: string; // German, shown in the nav
  labelI18n?: I18nString;
  isArchived?: boolean; // archived nodes stay in the tree, greyed, not rendered
  children?: WebsiteNode[]; // menu only
  pageKey?: string; // page only -> pages/{okey}
  slug?: string; // page only, unique within the site, [a-z0-9-]+
  url?: string; // link only: '/slug', '/termine?cat=regatta', 'https://…', 'mailto:…'
  style?: 'default' | 'button'; // link only: 'button' = the Mitgliederbereich CTA
}

export class WebsiteModel implements OkrModel {
  public okey = DEFAULT_KEY; // siteId, e.g. 'scs'
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = ''; // «Seeclub Stäfa Website»
  public hostingSite = ''; // Firebase Hosting site id, e.g. 'scs-website-54aef'
  public domain = ''; // public origin, e.g. 'https://seeclub.org'
  public languages: string[] = ['de']; // rendered languages; de is the source
  public templateVersion = ''; // set by the developer deploy, read by publish
  public tagline = ''; // footer tagline (German)
  public taglineI18n?: I18nString;
  public nav: WebsiteNode[] = []; // header navigation, ordered
  public footer: WebsiteNode[] = []; // footer link columns, ordered
  public homePageKey = ''; // page rendered at '/'
  public lastPublishedAt?: string; // ISO, written by publish
  public lastPublishedBy?: string; // personKey
  public lastPublishedVersion?: string; // Hosting version name, for rollback
  public draftChangedAt?: string; // ISO, bumped by every tree/page/section save

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WebsiteCollection = 'websites';
export const WebsiteModelName = 'website';
