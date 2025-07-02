import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';

import { CategoryCollection, CategoryListModel, UserModel } from '@bk2/shared/models';
import { ENV, FIRESTORE } from '@bk2/shared/config';
import { saveComment } from '@bk2/comment/util';
import { addIndexElement, createModel, getSystemQuery, searchData, updateModel } from '@bk2/shared/util-core';
import { confirmAction } from '@bk2/shared/util-angular';
import { bkTranslate } from '@bk2/shared/i18n';


@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new category in the database.
   * @param category the CategoryListModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created category
   */
  public async create(category: CategoryListModel, currentUser?: UserModel): Promise<string> {
        try {
      const _key = await createModel(this.firestore, CategoryCollection, category, this.tenantId);
      await confirmAction(bkTranslate('@category.operation.create.conf'), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, CategoryCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate('@category.operation.create.error'), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Lookup a category in the cached list by its document id and return it as an Observable.
   * @param key the document id of the category
   * @returns an Observable of the CategoryListModel
   */
  public read(key: string | undefined): Observable<CategoryListModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((persons: CategoryListModel[]) => {
        return persons.find((cat: CategoryListModel) => cat.bkey === key);
      }));
  }

  /**
   * Update a category in the database with new values.
   * @param category the CategoryListModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(category: CategoryListModel, currentUser?: UserModel, confirmMessage = '@category.operation.update'): Promise<string> {
    try {
      category.index = this.getSearchIndex(category);
      const _key = await updateModel(this.firestore, CategoryCollection, category);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, CategoryCollection, _key, '@comment.operation.update.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * We are actually deleting a category. 
   * @param category 
   */
  public async delete(category: CategoryListModel, currentUser?: UserModel): Promise<void> {
    category.isArchived = true;
    await this.update(category, currentUser, `@category.operation.delete`);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<CategoryListModel[]> {
    return searchData<CategoryListModel>(this.firestore, CategoryCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
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
