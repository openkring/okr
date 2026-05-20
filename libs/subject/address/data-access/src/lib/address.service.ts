import { Injectable, inject } from "@angular/core";
import { Observable, map, of } from "rxjs";

import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { AddressCollection, AddressModel, UserModel } from "@bk2/shared-models";
import { die, getSystemQuery } from "@bk2/shared-util-core";

import { getAddressIndex, getAddressValueByChannel } from "@bk2/subject-address-util";
import { ActivityService } from '@bk2/activity-data-access';

import { PFX } from "./scope";
import { I18nService } from "@bk2/shared-i18n";


@Injectable({
    providedIn: 'root'
})
export class AddressService {
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);

  public groupedItems$ = of([]);

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf: PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
    favorite_enable_conf: PFX + 'favorite.enable.conf',
    favorite_enable_error: PFX + 'favorite.enable.error',
    favorite_disable_conf: PFX + 'favorite.disable.conf',
    favorite_disable_error: PFX + 'favorite.disable.error'
  });

  /***************************  CRUD-operations *************************** */
  /**
   * Create a new address 
   * @param address the address to store in the database. It must contain a parentKey with modelType.key.
   * @param currentUser the current user who performs the operation
   * @returns an Observable of the new or existing address or undefined if the operation failed
   */
  public async create(address: AddressModel, currentUser?: UserModel): Promise<string | undefined> {
    address.index = getAddressIndex(address);
    const key = await this.firestoreService.createModel<AddressModel>(AddressCollection, address, 
      this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${address.addressChannel}/${getAddressValueByChannel(address)}`;
    void this.activityService.log('address', 'create', currentUser, payload);
    return key;
}

 /**
   * Return an Observable of an Address by uid from the database.
   * @param addressKey the key of the address document
   * @return an Observable of the AddressModel or undefined if not found
   */
  public read(addressKey: string): Observable<AddressModel | undefined> {
    return this.firestoreService.readModel<AddressModel>(AddressCollection, addressKey);
  }

  /**
   * Update an existing address.
   * @param address the address with new values
   * @param currentUser the current user who performs the operation
   * @returns the key of the updated address or undefined if the operation failed
   */
  public async update(address: AddressModel, currentUser?: UserModel): Promise<string | undefined> {
    address.index = getAddressIndex(address);
    const key = await this.firestoreService.updateModel<AddressModel>(AddressCollection, address, false, 
      this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const value = getAddressValueByChannel(address);
    const payload = `${address.bkey}: ${address.addressChannel} = ${value}`;
    void this.activityService.log('address', 'update', currentUser, payload);
    return key;
  }

  /**
   * Delete an address.
   * We don't delete addresses finally. Instead we deactivate/archive the objects.
   * Admin user may finally delete objects directly in the database.
   * @param address the object to delete
   * @param currentUser the current user who performs the operation
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(address: AddressModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AddressModel>(AddressCollection, address, 
      this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    const payload = `${address.bkey}: ${address.addressChannel}/${getAddressValueByChannel(address)}`;
    void this.activityService.log('address', 'delete', currentUser, payload);
  }

  /**
   * Toggle the favorite attribute.
   * @param address the object to delete
   */
  public async toggleFavorite(address: AddressModel, currentUser?: UserModel): Promise<string | undefined> {
    let conf: string;
    let error: string;
    let payload: string;
    if (address.isFavorite) {
      conf = this.i18n.favorite_disable_conf();
      error = this.i18n.favorite_disable_error();
      payload = `${address.bkey}: ${address.addressChannel} = fav disabled`;
    } else {
      conf = this.i18n.favorite_enable_conf();
      error = this.i18n.favorite_enable_error();
      payload = `${address.bkey}: ${address.addressChannel} = fav enabled`;
    }
    address.isFavorite = !address.isFavorite; // toggle
    const key = await this.firestoreService.updateModel<AddressModel>(AddressCollection, address, false, conf, error, currentUser);
    void this.activityService.log('address', 'update', currentUser, payload);
    return key;
  }

  /***************************  favorite address  *************************** */
  /**
   * Returns either the favorite address of the given channel or null if there is no favorite address for this channel.
   * @param channel the channel type (e.g. phone, email, web) to look for
   * @returns the favorite address fo the given channel or null
   */
  public getFavoriteAddressByChannel(channel: string): Observable<AddressModel | null> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'addressChannel', operator: '==', value: channel });
    query.push({ key: 'isFavorite', operator: '==', value: true });
    return this.firestoreService.searchData<AddressModel>(AddressCollection, query).pipe(map(addresses => {
      if (addresses.length > 1) die(`AddressUtil.getFavoriteAddressByChannel -> ERROR: only one favorite adress can exist per channel type (${AddressCollection})`);
      if (addresses.length === 1) return addresses[0];
      return null;
    }));
  }
}
