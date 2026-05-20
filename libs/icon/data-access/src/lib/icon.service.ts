import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { IconCollection, IconModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';
import { getIconIndex } from '@bk2/icon-util';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class IconService {
  private readonly env = inject(ENV);
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

  /*-------------------------- CRUD operations --------------------------------*/

  public async create(icon: IconModel, currentUser?: UserModel): Promise<string | undefined> {
    // index is editable in icon. That's why we don't generate the index here.
    // icon.index = getIconIndex(icon);
    return await this.firestoreService.createModel<IconModel>(IconCollection, icon, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  public read(key: string | undefined): Observable<IconModel | undefined> {
    return findByKey<IconModel>(this.list(), key);
  }

  public async update(icon: IconModel, currentUser?: UserModel): Promise<string | undefined> {
    icon.index = getIconIndex(icon);
    return await this.firestoreService.updateModel<IconModel>(IconCollection, icon, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  public async delete(icon: IconModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<IconModel>(IconCollection, icon, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/

  public list(orderBy = 'name', sortOrder = 'asc'): Observable<IconModel[]> {
    return this.firestoreService.searchData<IconModel>(IconCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}
