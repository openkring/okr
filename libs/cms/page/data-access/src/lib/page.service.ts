import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { PageCollection, PageModel, UserModel } from "@bk2/shared-models";
import { findByKey, getSystemQuery } from "@bk2/shared-util-core";

import { getPageIndex } from "@bk2/cms-page-util";

@Injectable({
    providedIn: 'root'
})
export class PageService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new page in the database.
   * @param page the PageModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created page
   */
  public async create(page: PageModel, currentUser: UserModel | undefined): Promise<string | undefined> {
    page.index = getPageIndex(page);
    return await this.firestoreService.createModel<PageModel>(PageCollection, page, '@content.page.operation.create', currentUser);
  }

  /**
   * Lookup a page in the cached list by its document id and return it as an Observable.
   * @param key the document id of the page
   * @returns an Observable of the PageModel
   */
    public read(key: string | undefined): Observable<PageModel | undefined> {
      return findByKey<PageModel>(this.list(), key);  
    }

  /**
   * Update a page in the database with new values.
   * @param page the PageModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(page: PageModel, currentUser?: UserModel, confirmMessage = '@content.page.operation.update'): Promise<string | undefined> {
    page.index = getPageIndex(page);
    return await this.firestoreService.updateModel<PageModel>(PageCollection, page, false, confirmMessage, currentUser);
  }

  /**
   * Delete a page.
   * We are not actually deleting a page. We are just archiving it.
   * @param key 
   */
  public async delete(page: PageModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<PageModel>(PageCollection, page, '@content.page.operation.delete', currentUser);
  }
  
  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<PageModel[]> {
    return this.firestoreService.searchData<PageModel>(PageCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}