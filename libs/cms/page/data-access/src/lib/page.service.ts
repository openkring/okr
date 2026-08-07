import { Injectable, inject } from "@angular/core";
import { map, Observable } from "rxjs";

import { ENV } from "@okr/shared-config";
import { FirestoreService } from "@okr/shared-data-access";
import { I18nService } from "@okr/shared-i18n";
import { PageCollection, PageModel, UserModel } from "@okr/shared-models";
import { findByKey, getSystemQuery } from "@okr/shared-util-core";

import { getPageIndex } from "@okr/cms-page-util";
import { PFX } from "./scope";

@Injectable({
    providedIn: 'root'
})
export class PageService {
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
   * Menu items are shared across tenants (e.g. menuItems/home -> /private/welcome), so the same
   * page id arrives for every tenant while each tenant owns its own doc named `<key>_<tenantId>`
   * (welcome_p13, welcome_kring, ...). Prefer that doc, fall back to the unsuffixed one.
   * @param key the document id of the page
   * @returns an Observable of the PageModel
   */
    public read(key: string | undefined): Observable<PageModel | undefined> {
      if (!key || key.length === 0) return findByKey<PageModel>(this.list(), key);
      const tenantKey = `${key}_${this.env.tenantId}`;
      return this.list().pipe(map(pages => pages.find(p => p.okey === tenantKey) ?? pages.find(p => p.okey === key)));
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