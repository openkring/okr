import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { ResponsibilityCollection, ResponsibilityModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getResponsibilityIndex } from '@bk2/relationship-responsibility-util';

@Injectable({ providedIn: 'root' })
export class ResponsibilityService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);

  public async create(responsibility: ResponsibilityModel, currentUser?: UserModel): Promise<string | undefined> {
    responsibility.index = getResponsibilityIndex(responsibility);
    return await this.firestoreService.createModel<ResponsibilityModel>(
      ResponsibilityCollection, responsibility, '@responsibility.operation.create', currentUser
    );
  }

  public read(key: string): Observable<ResponsibilityModel | undefined> {
    return findByKey<ResponsibilityModel>(this.list(), key);
  }

  public async update(responsibility: ResponsibilityModel, currentUser?: UserModel, confirmMessage = '@responsibility.operation.update'): Promise<string | undefined> {
    responsibility.index = getResponsibilityIndex(responsibility);
    return await this.firestoreService.updateModel<ResponsibilityModel>(
      ResponsibilityCollection, responsibility, false, confirmMessage, currentUser
    );
  }

  public async delete(responsibility: ResponsibilityModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ResponsibilityModel>(
      ResponsibilityCollection, responsibility, '@responsibility.operation.delete', currentUser
    );
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
