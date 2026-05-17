import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { I18nService } from "@bk2/shared-i18n";
import { PageCollection, PageModel, UserModel } from "@bk2/shared-models";
import { findByKey, getSystemQuery } from "@bk2/shared-util-core";

import { getPageIndex } from "@bk2/cms-page-util";
import { PFX } from "./scope";

@Injectable({
    providedIn: 'root'
})
export class PageService {
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
   * Create a new page in the database.
   * @param page the PageModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created page
   */
  public async create(page: PageModel, currentUser: UserModel | undefined): Promise<string | undefined> {
    page.index = getPageIndex(page);
    return await this.firestoreService.createModel<PageModel>(PageCollection, page, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
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
  public async update(page: PageModel, currentUser?: UserModel): Promise<string | undefined> {
    page.index = getPageIndex(page);
    return await this.firestoreService.updateModel<PageModel>(PageCollection, page, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * Delete a page.
   * We are not actually deleting a page. We are just archiving it.
   * @param key
   */
  public async delete(page: PageModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<PageModel>(PageCollection, page, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }
  
  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<PageModel[]> {
    return this.firestoreService.searchData<PageModel>(PageCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}