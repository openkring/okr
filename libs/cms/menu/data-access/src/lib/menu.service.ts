import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { MenuItemCollection, MenuItemModel, UserModel } from "@bk2/shared-models";
import { findByKey, getSystemQuery } from "@bk2/shared-util-core";
import { I18nService } from "@bk2/shared-i18n";

import { getMenuIndex } from "@bk2/cms-menu-util";
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
    return await this.firestoreService.updateModel<MenuItemModel>(MenuItemCollection, menuItem, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
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
