import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { MenuItemCollection, MenuItemModel, UserModel } from "@bk2/shared-models";
import { findByKey, getSystemQuery } from "@bk2/shared-util-core";

import { getMenuIndex } from "@bk2/cms-menu-util";

@Injectable({
    providedIn: 'root'
})
export class MenuService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new menuitem in the database.
   * @param menuitem the MenuItemModel to store in the database
   * @returns the document id of the newly created menuitem
   */
  public async create(menuItem: MenuItemModel, currentUser: UserModel | undefined): Promise<string | undefined> {
      menuItem.index = getMenuIndex(menuItem);
      return await this.firestoreService.createModel<MenuItemModel>(MenuItemCollection, menuItem, '@content.menuItem.operation.create', currentUser);
  }

  /**
   * Lookup a menuitem in the cached list by its document id and return it as an Observable.
   * @param key the document id of the menuitem
   * @returns an Observable of the MenuItemModel
   */
  public read(key: string): Observable<MenuItemModel | undefined> {
    return findByKey<MenuItemModel>(this.list(), key);
  }

  /**
   * Update a menuitem in the database with new values.
   * @param menuItem the MenuItemModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(menuItem: MenuItemModel, currentUser?: UserModel, confirmMessage = '@content.menuItem.operation.update'): Promise<string | undefined> {
    menuItem.index = getMenuIndex(menuItem);
    return await this.firestoreService.updateModel<MenuItemModel>(MenuItemCollection, menuItem, false, confirmMessage, currentUser);
  }

  /**
   * Delete a menuitem.
   * We are not actually deleting a menuitem. We are just archiving it.
   * @param key 
   */
  public async delete(menuItem: MenuItemModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<MenuItemModel>(MenuItemCollection, menuItem, '@content.menuItem.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<MenuItemModel[]> {
    return this.firestoreService.searchData<MenuItemModel>(MenuItemCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- OTHER --------------------------------*/
  /**
   * Remove the sub-menu-item itemId from the menu menuItem
   * @param menuItem 
   * @param itemId 
   */
  public async deleteSubMenu(menuItem: MenuItemModel, itemId: string): Promise<void> {
    if (menuItem.menuItems) {
      menuItem.menuItems.splice(menuItem.menuItems.indexOf(itemId), 1);
      await this.update(menuItem);  
    }
  }
}
