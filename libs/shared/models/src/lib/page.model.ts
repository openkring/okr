import { BkModel, MetaTag, NamedModel, SearchableModel, TaggedModel } from "./base.model";
import { ContentState } from "./enums/content-state.enum";
import { PageType } from "./enums/page-type.enum";

export class PageModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public name = ''; // a meaningful name for the trip
  public index = '';
  public tags = '';
  public title = '';      // used for SEO 
  public meta?: MetaTag[] = [];        // meta tags for SEO  
  public type = PageType.Content;
  public state = ContentState.Draft; // the state of the page
  public notes = ''; // a detailed description of the trip
  public sections: string[] = []; // section.bkey, section.name

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PageCollection = 'pages2';


// tbd: maybe add state for staging: draft, review, published, archived