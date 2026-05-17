import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { CategoryCollection, CategoryListModel, UserModel } from '@bk2/shared-models';
import { findByKey, getCategoryIndex, getSystemQuery } from '@bk2/shared-util-core';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'operation.create.conf',
    create_error: PFX + 'operation.create.error',
    update_conf:  PFX + 'operation.update.conf',
    update_error: PFX + 'operation.update.error',
    delete_conf:  PFX + 'operation.delete.conf',
    delete_error: PFX + 'operation.delete.error',
  });

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new category in the database.
   * @param category the CategoryListModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created category or undefined if the operation failed
   */
  public async create(category: CategoryListModel, currentUser?: UserModel): Promise<string | undefined> {
    category.index = getCategoryIndex(category);
    return await this.firestoreService.createModel<CategoryListModel>(CategoryCollection, category, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  /**
   * Lookup a category in the cached list by its document id and return it as an Observable.
   * @param key the document id of the category
   * @returns an Observable of the CategoryListModel
   */
  public read(key: string | undefined): Observable<CategoryListModel | undefined> {
    return findByKey<CategoryListModel>(this.list(), key);
  }

  /**
   * Update a category in the database with new values.
   * @param category the CategoryListModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(category: CategoryListModel, currentUser?: UserModel): Promise<string | undefined> {
    category.index = getCategoryIndex(category);
    return await this.firestoreService.updateModel<CategoryListModel>(CategoryCollection, category, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * We are actually deleting a category.
   * @param category
   */
  public async delete(category: CategoryListModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<CategoryListModel>(CategoryCollection, category, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<CategoryListModel[]> {
    return this.firestoreService.searchData<CategoryListModel>(CategoryCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}
