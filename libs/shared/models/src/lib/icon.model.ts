import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_PATH, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * An organization or company.
 * Groups are also organizations (with OrgType=Group). They can be used on different levels, e.g. as a department or a team.
 * Hierarchies or orgcharts can be built using memberships.
 */
export class IconModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public name = DEFAULT_NAME;   // the name of the icon, just one word, e.g. download, it is the same as the filename without extension (.svg)
  // icon type = IconSet; it is the name of the subfolder within the logo dir in Firebase storage
  public type = DEFAULT_ORG_TYPE; // the icon type, which is the icon set
  public notes = DEFAULT_NOTES;
  public tags = DEFAULT_TAGS;   // tag categories, e.g. finance, business, sport, rowingboat, animal etc.
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX; // index is editable; it just contains a list of words, e.g. 'create edit new'

  public fullPath = DEFAULT_PATH; // full storage path, e.g. 'logo/icons/folder.svg'
  public size = 0;  // size in bytes
  public updated = DEFAULT_DATE;   // stored date format (for prettyDate pipe)

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const IconCollection = 'icons';
export const IconModelName = 'icon';
