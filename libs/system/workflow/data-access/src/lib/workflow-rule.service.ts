import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { UserModel, WorkflowRuleCollection, WorkflowRuleModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { ActivityService } from '@okr/activity-data-access';
import { getWorkflowRuleIndex } from '@okr/system-workflow-util';

import { PFX } from './scope';

/**
 * CRUD for the tenant's workflow rules (spec 1.35). The rules are only READ by the
 * Cloud Function engine — this service is the admin authoring side.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowRuleService {
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });
  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(rule: WorkflowRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    rule.index = getWorkflowRuleIndex(rule);
    const key = await this.firestoreService.createModel<WorkflowRuleModel>(WorkflowRuleCollection, rule, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('workflowRule', 'create', currentUser, `${key}:${rule.name}`);
    return key;
  }

  public read(key: string): Observable<WorkflowRuleModel | undefined> {
    return this.firestoreService.readModel<WorkflowRuleModel>(WorkflowRuleCollection, key);
  }

  public async update(rule: WorkflowRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    rule.index = getWorkflowRuleIndex(rule);
    const key = await this.firestoreService.updateModel<WorkflowRuleModel>(WorkflowRuleCollection, rule, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('workflowRule', 'update', currentUser, `${key}:${rule.name}`);
    return key;
  }

  public async delete(rule: WorkflowRuleModel, currentUser?: UserModel): Promise<void> {
    const payload = `${rule.okey}:${rule.name}`;
    await this.firestoreService.deleteModel<WorkflowRuleModel>(WorkflowRuleCollection, rule, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('workflowRule', 'delete', currentUser, payload);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'order', sortOrder: 'asc' | 'desc' = 'asc'): Observable<WorkflowRuleModel[]> {
    return this.firestoreService.searchData<WorkflowRuleModel>(WorkflowRuleCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }
}
