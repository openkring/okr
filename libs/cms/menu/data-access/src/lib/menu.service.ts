import { inject, Injectable } from "@angular/core";
import { map, Observable, of } from "rxjs";
import { ToastController } from "@ionic/angular/standalone";
import { collection, doc, DocumentReference, setDoc, updateDoc } from "firebase/firestore";

import { ENV, FIRESTORE } from "@bk2/shared/config";
import { MenuItemCollection, MenuItemModel, UserModel } from "@bk2/shared/models";
import { bkTranslate } from "@bk2/shared/i18n";
import { die, getSystemQuery, removeProperty, searchData } from "@bk2/shared/util-core";
import { confirmAction } from "@bk2/shared/util-angular";

import { saveComment } from "@bk2/comment/util";

import { getSearchIndex } from "@bk2/cms/menu/util";

@Injectable({
    providedIn: 'root'
})
export class MenuService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new menuitem in the database.
   * @param menuitem the MenuItemModel to store in the database
   * @returns the document id of the newly created menuitem
   */
  public async create(menuItem: MenuItemModel, currentUser: UserModel | undefined): Promise<string> {
    // add index and tenant
    menuItem.index = getSearchIndex(menuItem);
    menuItem.tenants = [this.tenantId];

    try {
      let _ref: DocumentReference;
      let _storedModel = menuItem as object;
      if (!menuItem.bkey || menuItem.bkey.length === 0) {           // there is no bkey in the model
        _ref = doc(collection(this.firestore, MenuItemCollection));    // automatically assign the document ID
      } else {
        _ref = doc(this.firestore, MenuItemCollection, menuItem.bkey); // use bkey as the document ID
        _storedModel = removeProperty(menuItem, 'bkey');                                 // remove bkey from the stored model
      }
      await setDoc(_ref, _storedModel);
      await confirmAction(bkTranslate('@content.menuItem.operation.create.conf'), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, MenuItemCollection, _ref.id, '@comment.operation.initial.conf');
      return Promise.resolve(_ref.id);
    } 
    catch (_ex) {
      await confirmAction(bkTranslate('@content.menuItem.operation.create.error'), true, this.toastController);
      console.error('MenuService.create() -> ERROR: ', _ex);
      return Promise.reject(new Error('Failed to create model'));
    }
  }

  /**
   * Lookup a menuitem in the cached list by its document id and return it as an Observable.
   * @param key the document id of the menuitem
   * @returns an Observable of the MenuItemModel
   */
  public read(key: string): Observable<MenuItemModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((menuItems: MenuItemModel[]) => {
        return menuItems.find((menuItem: MenuItemModel) => menuItem.bkey === key);
      }));
  }

  /**
   * Update a menuitem in the database with new values.
   * @param menuItem the MenuItemModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(menuItem: MenuItemModel, confirmMessage = '@content.menuItem.operation.update'): Promise<string> {
    menuItem.index = getSearchIndex(menuItem);

      if (!menuItem.tenants || menuItem.tenants.length === 0) die('MenuService.update: tenants is mandatory.');
    
      const _key = menuItem.bkey;
      if (!_key || _key.length === 0) die('MenuService.update: bkey is mandatory.');
    
      const _prefix = `BaseModelUtil.updateModel(${_key} of type ${menuItem.action})`;
      const _path = `${MenuItemCollection}/${_key}`;
    
      // we delete attribute bkey from the model because we don't want to store it in the database (_ref.id is available instead)
      const _storedModel = removeProperty(menuItem, 'bkey');
      
      try {
        await updateDoc(doc(this.firestore, _path), {..._storedModel});
        await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
        return Promise.resolve(_key);
      }
      catch (_ex) {
        console.error(`${_prefix} -> ERROR: `, _ex);
        await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
        return Promise.reject(new Error('Failed to update model'));
      }
  }

  /**
   * Delete a menuitem.
   * We are not actually deleting a menuitem. We are just archiving it.
   * @param key 
   */
  public async delete(menuItem: MenuItemModel) {
    menuItem.isArchived = true;
    await this.update(menuItem, `@content.menuItem.operation.delete`);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<MenuItemModel[]> {
    return searchData<MenuItemModel>(this.firestore, MenuItemCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
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
