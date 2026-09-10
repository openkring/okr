import { Injectable, inject } from "@angular/core";
import { map, Observable } from "rxjs";

import { ENV } from "@okr/shared-config";
import { FirestoreService } from "@okr/shared-data-access";
import { I18nService } from "@okr/shared-i18n";
import { PageCollection, PageModel, UserModel } from "@okr/shared-models";
import { findByKey, forkKeyFor, getSystemQuery, isOwnedBy } from "@okr/shared-util-core";

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
      const tenantKey = forkKeyFor(key, this.env.tenantId);
      return this.list().pipe(map(pages => pages.find(p => p.okey === tenantKey) ?? pages.find(p => p.okey === key)));
    }

  /**
   * Update a page in the database with new values.
   *
   * COPY-ON-WRITE. The shell pages (`impressum`, `privacy`, `terms`, `dashboard`, `help`, the
   * sitemap) are SHARED — one document read by the whole fleet through the `'system'` sentinel,
   * or by a list of tenants. Writing one in place would silently change every other tenant's
   * page, and against a `'system'` document `firestore.rules` refuses the write outright
   * (`canWriteTenant()` does not accept the sentinel), so the save would just fail. So: edit in
   * place only what this tenant owns alone, otherwise fork.
   *
   * The fork keeps the `<okey>_<tenantId>` id `read()` above already prefers — a random id (the
   * `forkModel` default, right for categories and tags, which are found by identity) would
   * produce a document nothing ever reads again. Mirrors `CategoryService.update`.
   *
   * @param page the PageModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(page: PageModel, currentUser?: UserModel): Promise<string | undefined> {
    page.index = getPageIndex(page);
    if (isOwnedBy(page, this.env.tenantId)) {
      return await this.firestoreService.updateModel<PageModel>(PageCollection, page, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    }
    return await this.firestoreService.forkModel<PageModel>(
      PageCollection, page, {}, this.i18n.update_error(), forkKeyFor(page.okey, this.env.tenantId));
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