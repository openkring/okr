import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { CategoryCollection, CategoryListModel, UserModel } from '@okr/shared-models';
import { dedupeForTenant, findByKey, getCategoryIndex, getSystemQuery, isOwnedBy } from '@okr/shared-util-core';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
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
   *
   * COPY-ON-WRITE. Most category definitions are SHARED — one document read by the whole
   * fleet through the `'system'` sentinel, or by a list of tenants. Writing such a document
   * in place would silently change everybody else's vocabulary, and against a `'system'`
   * document `firestore.rules` refuses the write outright (`canWriteTenant()` does not accept
   * the sentinel), so the save would simply fail. So: edit in place only what this tenant owns
   * alone, and otherwise fork — a new document with `tenants: [tenantId]` carrying the edit,
   * in one batch with `arrayRemove(tenantId)` on the source.
   *
   * This mirrors `AocTagStore.saveTags`, which has done the same for `tags` since the fork
   * helper existed; categories were the collection still missing it, which is why they could
   * not move to the sentinel. The `arrayRemove` half is a no-op when the source is a
   * `'system'` document — nothing to remove — so both documents then match this tenant's
   * query and `pickForTenant` (own beats shared) is what resolves them on read.
   *
   * @param category the CategoryListModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(category: CategoryListModel, currentUser?: UserModel): Promise<string | undefined> {
    category.index = getCategoryIndex(category);
    if (isOwnedBy(category, this.env.tenantId)) {
      return await this.firestoreService.updateModel<CategoryListModel>(CategoryCollection, category, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    }
    return await this.firestoreService.forkModel<CategoryListModel>(CategoryCollection, category, {}, this.i18n.update_error());
  }

  /**
   * We are actually deleting a category.
   * @param category
   */
  public async delete(category: CategoryListModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<CategoryListModel>(CategoryCollection, category, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  
  /**
   * Every category this tenant may use, ONE per `name`: a tenant that forked a shared
   * definition matches both its own copy and the shared original, and a list view showing the
   * same category twice — one of them uneditable — is the visible half of that. `pickForTenant`
   * inside `dedupeForTenant` keeps the tenant's own.
   */
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<CategoryListModel[]> {
    return this.firestoreService.searchData<CategoryListModel>(CategoryCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder)
      .pipe(map(categories => dedupeForTenant(categories, category => category.name, this.env.tenantId)));
  }
}
