import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ActivityService } from '@okr/activity-data-access';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { ProjectCollection, ProjectModel, UserModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { findByKey, getArchiveInclusiveQuery, getSystemQuery } from '@okr/shared-util-core';
import { getProjectIndex, getProjectParentKey } from '@okr/project-project-util';
import { TaskService } from '@okr/project-task-data-access';

import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly taskService = inject(TaskService);
  private readonly alertService = inject(AlertService);

  protected readonly i18n = this.i18nService.translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf: PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
    delete_detached: PFX + 'delete.detached'
  });

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Creates a new project. The search index is recomputed before the write.
   * @returns the key of the created project or undefined if the operation failed
   */
  public async create(project: ProjectModel, currentUser?: UserModel): Promise<string | undefined> {
    project.index = getProjectIndex(project);
    const key = await this.firestoreService.createModel<ProjectModel>(ProjectCollection, project, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('project', 'create', currentUser, `${key}: ${project.name}`);
    return key;
  }

  /** Returns the project with the given key, archived ones included (undefined when unknown). */
  public read(key: string): Observable<ProjectModel | undefined> {
    return findByKey<ProjectModel>(this.listAll(), key);
  }

  /**
   * Updates a project. The search index is recomputed before the write.
   * @returns the key of the updated project or undefined if the operation failed
   */
  public async update(project: ProjectModel, currentUser?: UserModel): Promise<string | undefined> {
    project.index = getProjectIndex(project);
    const key = await this.firestoreService.updateModel<ProjectModel>(ProjectCollection, project, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('project', 'update', currentUser, `${key}: ${project.name}`);
    return key;
  }

  /**
   * Deletes a project the way every model is deleted (deleting-models skill): FirestoreService.deleteModel
   * detaches the current tenant from `tenants`, or archives the document when it was the last one.
   * Never write `isArchived = true` here.
   *
   * Invariant 3: the tasks that point at this project (`TaskModel.parentKey = 'project.<okey>'`,
   * archived ones too) move back to the backlog first. If reading or detaching any of them fails,
   * detachParent rejects, deleteModel is NOT called (the project stays) and the error propagates to the caller.
   */
  public async delete(project: ProjectModel, currentUser?: UserModel): Promise<void> {
    const payload = `${project.okey}: ${project.name}`;
    const detached = await this.taskService.detachParent(getProjectParentKey(project.okey), this.env.tenantId);
    if (detached > 0) void this.alertService.showToast(this.i18n.delete_detached().replace('{count}', String(detached)));
    await this.firestoreService.deleteModel<ProjectModel>(ProjectCollection, project, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('project', 'delete', currentUser, payload);
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  /**
   * Lists the projects of the current tenant.
   * @param orderBy the field to order by (default: startDate)
   * @param sortOrder asc or desc (default: desc, newest first)
   */
  public list(orderBy = 'startDate', sortOrder = 'desc'): Observable<ProjectModel[]> {
    return this.firestoreService.searchData<ProjectModel>(ProjectCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /**
   * All projects of the current tenant, archived ones included, newest start first. Feed this to
   * `okr-project-select` so an archived project that is still referenced keeps its name.
   * Needs no composite index: unordered query, sorted on the client.
   */
  public listAll(): Observable<ProjectModel[]> {
    return this.firestoreService.searchData<ProjectModel>(ProjectCollection, getArchiveInclusiveQuery(this.env.tenantId), 'none').pipe(
      map(projects => [...projects].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))));
  }
}
