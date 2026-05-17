import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { ResponsibilityCollection, ResponsibilityModel, UserModel } from '@bk2/shared-models';
import { findByKey, getFullName, getSystemQuery } from '@bk2/shared-util-core';

import { getResponsibilityIndex } from '@bk2/relationship-responsibility-util';
import { ActivityService } from '@bk2/activity-data-access';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class ResponsibilityService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'operation.create.conf',
    create_error: PFX + 'operation.create.error',
    update_conf:  PFX + 'operation.update.conf',
    update_error: PFX + 'operation.update.error',
    delete_conf:  PFX + 'operation.delete.conf',
    delete_error: PFX + 'operation.delete.error',
  });

  public async create(responsibility: ResponsibilityModel, currentUser?: UserModel): Promise<string | undefined> {
    responsibility.index = getResponsibilityIndex(responsibility);
    const key = await this.firestoreService.createModel<ResponsibilityModel>(
      ResponsibilityCollection, responsibility, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
    const payload = `${key}: ${getFullName(responsibility.responsibleAvatar?.name1, responsibility.responsibleAvatar?.name2)} = ${responsibility.name}`;
    void this.activityService.log('responsibility', 'create', currentUser, payload);
    return key;
  }

  public read(key: string): Observable<ResponsibilityModel | undefined> {
    return findByKey<ResponsibilityModel>(this.list(), key);
  }

  public async update(responsibility: ResponsibilityModel, currentUser?: UserModel): Promise<string | undefined> {
    responsibility.index = getResponsibilityIndex(responsibility);
    const key = await this.firestoreService.updateModel<ResponsibilityModel>(
      ResponsibilityCollection, responsibility, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
    const payload = `${key}: ${getFullName(responsibility.responsibleAvatar?.name1, responsibility.responsibleAvatar?.name2)} = ${responsibility.name}`;
    void this.activityService.log('responsibility', 'update', currentUser, payload);
    return key;
  }

  public async delete(responsibility: ResponsibilityModel, currentUser?: UserModel): Promise<void> {
    const payload = `${responsibility.bkey}: ${getFullName(responsibility.responsibleAvatar?.name1, responsibility.responsibleAvatar?.name2)} = ${responsibility.name}`;
    await this.firestoreService.deleteModel<ResponsibilityModel>(ResponsibilityCollection, responsibility, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('responsibility', 'delete', currentUser, payload);
  }

  public list(orderBy = 'validFrom', sortOrder = 'asc'): Observable<ResponsibilityModel[]> {
    return this.firestoreService.searchData<ResponsibilityModel>(
      ResponsibilityCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder
    );
  }

  public listForParent(parentKey: string): Observable<ResponsibilityModel[]> {
    if (!parentKey) return of([]);
    return this.list().pipe(
      map(items => items.filter(r => r.parentKey === parentKey))
    );
  }

  public listForResponsible(responsibleKey: string): Observable<ResponsibilityModel[]> {
    if (!responsibleKey) return of([]);
    return this.list().pipe(
      map(items => items.filter(r =>
        r.responsibleAvatar?.key === responsibleKey ||
        r.delegateAvatar?.key === responsibleKey
      ))
    );
  }
}
