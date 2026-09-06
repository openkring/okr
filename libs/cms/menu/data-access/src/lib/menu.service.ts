import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { ENV } from "@okr/shared-config";
import { FirestoreService } from "@okr/shared-data-access";
import { MenuItemCollection, MenuItemModel, UserModel } from "@okr/shared-models";
import { findByKey, getSystemQuery } from "@okr/shared-util-core";
import { I18nService } from "@okr/shared-i18n";

import { getMenuIndex } from "@okr/cms-menu-util";
import { PFX } from "./scope";

@Injectable({
    providedIn: 'root'
})
export class MenuService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);

  // i18n
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
   * Create a new menuitem in the database.
   * @param menuitem the MenuItemModel to store in the database
   * @returns the document id of the newly created menuitem
   */
  public async create(menuItem: MenuItemModel, currentUser: UserModel | undefined): Promise<string | undefined> {
    menuItem.index = getMenuIndex(menuItem);
    return await this.firestoreService.createModel<MenuItemModel>(MenuItemCollection, menuItem, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  /**
   * Lookup a menuitem in the cached list by its name and return it as an Observable.
   * @param name the name of the menuitem
   * @returns an Observable of the MenuItemModel
   */
  public read(name?: string): Observable<MenuItemModel | undefined> {
    return findByKey<MenuItemModel>(this.list(), name, 'name');
  }

  /**
   * Update a menuitem in the database with new values.
   * @param menuItem the MenuItemModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(menuItem: MenuItemModel, currentUser?: UserModel): Promise<string | undefined> {
    menuItem.index = getMenuIndex(menuItem);
    const others = menuItem.tenants.filter(t => t !== this.env.tenantId);
    if (others.length > 0 && menuItem.tenants.includes(this.env.tenantId)) {
      return await this.fork(menuItem, others, currentUser);
    }
    return await this.firestoreService.updateModel<MenuItemModel>(MenuItemCollection, menuItem, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * Copy-on-write for a menu document shared with other tenants (D-BB-8, design §5).
   *
   * The feature catalogue seeds ONE `menuItems` document per key and adds each tenant to its
   * `tenants[]` — so editing it in place renames it for all of them. Instead we copy it to a
   * tenant-private document, remove this tenant from the shared original, and point the copy
   * back at it via `forkedFrom`. The fork keeps the same `name`: parents reference children by
   * name, and `MenuService.read` resolves by name, so nothing else has to be rewritten. After
   * the detach, this tenant's query returns exactly one document for that name again.
   *
   * A later catalogue structural fix (url/action/roleNeeded) reaches the shared original and no
   * longer this fork — that is the deliberate trade of D-BB-8, and what `forkedFrom` exists to
   * make detectable.
   *
   * Order is create-then-detach on purpose: if the detach fails the tenant sees two documents
   * for one name (recoverable — the next edit retries the detach), whereas detach-first would
   * lose the menu item outright if the copy then failed.
   *
   * A document scoped to the `system` tenant only (this tenant not in `tenants[]`) is NOT
   * forked: there is nothing to detach, so a copy would leave two resolvable documents for one
   * name. There are none in the `menuItems` collection today (verified 2026-08-07).
   *
   * ponytail: no fork-back / "structur übernehmen" action yet — the picker half of §5. Add it
   * when a catalogue structural fix first has to be replayed onto a fork.
   */
  private async fork(menuItem: MenuItemModel, others: string[], currentUser?: UserModel): Promise<string | undefined> {
    const sharedKey = menuItem.okey;
    // createModel forces tenants = [env.tenantId] and honours a preset okey.
    const forked: MenuItemModel = { ...menuItem, okey: `${menuItem.name}_${this.env.tenantId}`, forkedFrom: sharedKey };
    const key = await this.firestoreService.createModel<MenuItemModel>(MenuItemCollection, forked, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    if (!key) return undefined;   // copy failed → leave the shared document untouched
    await this.firestoreService.updateObject<Partial<MenuItemModel>>(MenuItemCollection, sharedKey, { tenants: others });
    return key;
  }

  /**
   * Delete a menuitem.
   * We are not actually deleting a menuitem. We are just archiving it.
   * @param menuItem the MenuItemModel to delete
   * @param currentUser the current user performing the delete operation 
   */
  public async delete(menuItem: MenuItemModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<MenuItemModel>(MenuItemCollection, menuItem, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<MenuItemModel[]> {
    return this.firestoreService.searchData<MenuItemModel>(MenuItemCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /** One-shot, consistent read (no cache-first race). Promise counterpart to {@link list}. */
  public listOnce(orderBy = 'name', sortOrder = 'asc'): Promise<MenuItemModel[]> {
    return this.firestoreService.getDataOnce<MenuItemModel>(MenuItemCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /**
   * Drop the shared, cached listener behind {@link list}.
   *
   * `FirestoreService.searchData` hands every caller the SAME `shareReplay`'d observable per
   * query, and evicts it only when the stream ERRORS. A listener that simply never delivers its
   * first snapshot is therefore sticky: every later subscriber joins the same silent listener.
   * Call this before falling back, so the next `list()` builds a fresh one.
   */
  public clearListCache(orderBy = 'name', sortOrder = 'asc'): void {
    this.firestoreService.clearCache(MenuItemCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- OTHER --------------------------------*/
  /**
   * Remove the sub-menu-item itemId from the menu menuItem
   * @param menuItem the MenuItemModel from which to remove the sub-menu-item
   * @param itemId the id of the sub-menu-item to remove
   */
  public async deleteSubMenu(menuItem: MenuItemModel, itemId: string): Promise<void> {
    if (menuItem.menuItems) {
      menuItem.menuItems.splice(menuItem.menuItems.indexOf(itemId), 1);
      await this.update(menuItem);  
    }
  }
}
