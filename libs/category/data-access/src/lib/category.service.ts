import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';

import { CategoryCollection, CategoryListModel, UserModel } from '@bk2/shared/models';
import { ENV, FIRESTORE } from '@bk2/shared/config';
import { saveComment } from '@bk2/comment/util';
import { addIndexElement, createModel, getSystemQuery, searchData, updateModel } from '@bk2/shared/util';


@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new category in the database.
   * @param category the CategoryListModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created category
   */
  public async create(category: CategoryListModel, currentUser?: UserModel): Promise<string> {
    const _key = await createModel(this.firestore, CategoryCollection, category, this.tenantId, '@category.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, CategoryCollection, _key, '@comment.operation.initial.conf');
    return _key;    
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
   * Update an category in the database with new values.
   * @param category the CategoryListModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(category: CategoryListModel, confirmMessage = '@category.operation.update'): Promise<void> {
    category.index = this.getSearchIndex(category);
    await updateModel(this.firestore, CategoryCollection, category, confirmMessage, this.toastController);
  }

  /**
   * We are actually deleting a category. 
   * @param category 
   */
  public async delete(category: CategoryListModel): Promise<void> {
    category.isArchived = true;
    await this.update(category, `@category.operation.delete`);
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
