import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CategoryCollection, CategoryListModel, UserModel } from '@bk2/shared/models';
import { ENV } from '@bk2/shared/config';
import { addIndexElement, findByKey, getSystemQuery } from '@bk2/shared/util-core';
import { FirestoreService } from '@bk2/shared/data-access';


@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new category in the database.
   * @param category the CategoryListModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created category or undefined if the operation failed
   */
  public async create(category: CategoryListModel, currentUser?: UserModel): Promise<string | undefined> {
    category.index = this.getSearchIndex(category);
    return await this.firestoreService.createModel<CategoryListModel>(CategoryCollection, category, '@category.operation.create', currentUser);
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
  public async update(category: CategoryListModel, currentUser?: UserModel, confirmMessage = '@category.operation.update'): Promise<string | undefined> {
      category.index = this.getSearchIndex(category);
      return await this.firestoreService.updateModel<CategoryListModel>(CategoryCollection, category, false, confirmMessage, currentUser);
  }

  /**
   * We are actually deleting a category. 
   * @param category 
   */
  public async delete(category: CategoryListModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<CategoryListModel>(CategoryCollection, category, '@category.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<CategoryListModel[]> {
    return this.firestoreService.searchData<CategoryListModel>(CategoryCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given category based on its values.
   * @param category 
   * @returns the index string
   */
  public getSearchIndex(category: CategoryListModel): string {
    let _index = '';
    _index = addIndexElement(_index, 'n', category.name);
    return _index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return 'n:name';
  }

}
