import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { IconCollection, IconModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';
import { getIconIndex } from '@bk2/icon-util';

@Injectable({
  providedIn: 'root'
})
export class IconService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/

  public async create(icon: IconModel, currentUser?: UserModel): Promise<string | undefined> {
    icon.index = getIconIndex(icon);
    return await this.firestoreService.createModel<IconModel>(IconCollection, icon, '@icon.operation.create', currentUser);
  }

  public read(key: string | undefined): Observable<IconModel | undefined> {
    return findByKey<IconModel>(this.list(), key);
  }

  public async update(icon: IconModel, currentUser?: UserModel): Promise<string | undefined> {
    icon.index = getIconIndex(icon);
    return await this.firestoreService.updateModel<IconModel>(IconCollection, icon, false, '@icon.operation.update', currentUser);
  }

  public async delete(icon: IconModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<IconModel>(IconCollection, icon, '@icon.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/

  public list(orderBy = 'name', sortOrder = 'asc'): Observable<IconModel[]> {
    return this.firestoreService.searchData<IconModel>(IconCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}
