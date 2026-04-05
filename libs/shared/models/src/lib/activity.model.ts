import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { AvatarInfo } from './avatar-info';
import { BkModel, SearchableModel } from './base.model';
import { RoleName } from './menu-item.model';

/**
 * ActivityModel represents a system audit log entry.
 * Activities are immutable — they are written once and never edited.
 *
 * index format: t:<timestamp> c:<scope> a:<action> p:<author-name>
 */
export class ActivityModel implements BkModel, SearchableModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  /** Search index: t:<timestamp> c:<scope> a:<action> p:<author-name> */
  public index = '';

  /** StoreDateTime: yyyyMMddHHmmss */
  public timestamp = '';

  /** Category: activity-scope, e.g. 'auth', 'rag', 'person', 'membership' */
  public scope = '';

  /** Category: activity-action, e.g. 'login', 'logout', 'create', 'delete', 'update' */
  public action = '';

  /** Minimum role required to see this activity entry */
  public roleNeeded: RoleName = 'admin';

  /** Any result or additional info about the activity (e.g. search term, resource key) */
  public payload = '';

  /** The user who triggered this activity */
  public author: AvatarInfo | undefined;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ActivityCollection = 'activities';
export const ActivityModelName = 'activity';
