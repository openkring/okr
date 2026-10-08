import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PROJECT_STATE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { OkrModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from './base.model';

/** A grouping of tasks with dates and a cost object (spec 3.14). Not a PM system — see its non-goals. */
export class ProjectModel implements OkrModel, PersistedModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;            // the document id; no separate human-readable id (D5)
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public description = DEFAULT_NOTES;
  public startDate = DEFAULT_DATE;      // StoreDate; drives the date shift when duplicating (D9)
  public endDate = DEFAULT_DATE;
  public projectManager: AvatarInfo | undefined;
  public state = DEFAULT_PROJECT_STATE; // project_state category item name

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ProjectCollection = 'projects';
export const ProjectModelName = 'project';
