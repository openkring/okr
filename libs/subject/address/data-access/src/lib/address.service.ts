import { Injectable, inject } from "@angular/core";
import { Observable, map, of } from "rxjs";

import { ENV } from "@okr/shared-config";
import { FirestoreService } from "@okr/shared-data-access";
import { AddressCollection, AddressModel, UserModel } from "@okr/shared-models";
import { die, getSystemQuery } from "@okr/shared-util-core";
import { I18nService } from "@okr/shared-i18n";

import { getAddressIndex, getAddressValueByChannel, normalizeAddressValue } from "@okr/subject-address-util";
import { ActivityService } from '@okr/activity-data-access';

import { PFX } from "./scope";


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
    normalizeAddressValue(address);
    address.index = getAddressIndex(address);
    const key = await this.firestoreService.createModel<AddressModel>(AddressCollection, address,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${address.addressChannel}/${getAddressValueByChannel(address)}`;
    void this.activityService.log('address', 'create', currentUser, payload);
    // the new doc's key is only known now — demote against it, not against the empty okey
    if (key) await this.demoteOtherFavorites({ ...address, okey: key }, currentUser);
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
    normalizeAddressValue(address);
    address.index = getAddressIndex(address);
    const key = await this.firestoreService.updateModel<AddressModel>(AddressCollection, address, false, 
      this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const value = getAddressValueByChannel(address);
    const payload = `${address.okey}: ${address.addressChannel} = ${value}`;
    void this.activityService.log('address', 'update', currentUser, payload);
    await this.demoteOtherFavorites(address, currentUser);
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
    const payload = `${address.okey}: ${address.addressChannel}/${getAddressValueByChannel(address)}`;
    void this.activityService.log('address', 'delete', currentUser, payload);
  }

  /**
   * Toggle the favorite attribute. Raising it demotes the channel's previous
   * favorite — there is at most one per parent + channel (see demoteOtherFavorites).
   * @param address the address to toggle
   */
  public async toggleFavorite(address: AddressModel, currentUser?: UserModel): Promise<string | undefined> {
    let conf: string;
    let error: string;
    let payload: string;
    if (address.isFavorite) {
      conf = this.i18n.favorite_disable_conf();
      error = this.i18n.favorite_disable_error();
      payload = `${address.okey}: ${address.addressChannel} = fav disabled`;
    } else {
      conf = this.i18n.favorite_enable_conf();
      error = this.i18n.favorite_enable_error();
      payload = `${address.okey}: ${address.addressChannel} = fav enabled`;
    }
    address.isFavorite = !address.isFavorite; // toggle
    const key = await this.firestoreService.updateModel<AddressModel>(AddressCollection, address, false, conf, error, currentUser);
    void this.activityService.log('address', 'update', currentUser, payload);
    await this.demoteOtherFavorites(address, currentUser);
    return key;
  }

  /***************************  favorite address  *************************** */
  /**
   * Enforce ONE favorite per parent + channel by clearing the flag on every other
   * address of that channel — the address just written always wins.
   *
   * The invariant was assumed everywhere but enforced nowhere:
   * `getFavoriteAddressByChannel` `die()`s on a second favorite, `generateQrEzs`
   * and `getFavoritePostalAddress` silently pick an arbitrary one, and since spec
   * 1.19 D-P4-6 the favorite is the single address of its channel that registered
   * members see — so a stray second favorite decides, at random, which address of
   * a person the whole tenant gets to see.
   *
   * Called from every write path that can raise the flag (create, update,
   * toggleFavorite). Demotions are written silently: they are a consequence of the
   * user's action, which has already shown its own confirmation toast.
   */
  private async demoteOtherFavorites(address: AddressModel, currentUser?: UserModel): Promise<void> {
    if (!address.isFavorite || !address.parentKey) return;
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'parentKey', operator: '==', value: address.parentKey });
    query.push({ key: 'addressChannel', operator: '==', value: address.addressChannel });
    query.push({ key: 'isFavorite', operator: '==', value: true });
    const favorites = await this.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');
    for (const other of favorites.filter((favorite) => favorite.okey !== address.okey)) {
      other.isFavorite = false;
      await this.firestoreService.updateModel<AddressModel>(AddressCollection, other, false, undefined, undefined, currentUser);
      void this.activityService.log('address', 'update', currentUser,
        `${other.okey}: ${other.addressChannel} = fav disabled (superseded by ${address.okey})`);
    }
  }

  /**
   * Returns a subject's favorite address of the given channel, or null if it has none.
   *
   * Scoped to `parentKey`: the favorite invariant is one per parent + channel (see
   * demoteOtherFavorites), so the query must name the parent. Without it the query
   * matches the channel's favorite of every subject in the tenant and the `die()`
   * below fires as soon as two people have, say, a favorite email.
   *
   * @param parentKey the subject's AddressModel.parentKey, i.e. `person.<okey>` / `org.<okey>`
   * @param channel the channel type (e.g. phone, email, web) to look for
   * @returns the favorite address of the given channel or null
   */
  public getFavoriteAddressByChannel(parentKey: string, channel: string): Observable<AddressModel | null> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'parentKey', operator: '==', value: parentKey });
    query.push({ key: 'addressChannel', operator: '==', value: channel });
    query.push({ key: 'isFavorite', operator: '==', value: true });
    return this.firestoreService.searchData<AddressModel>(AddressCollection, query).pipe(map(addresses => {
      if (addresses.length > 1) die(`AddressService.getFavoriteAddressByChannel -> ERROR: only one favorite address can exist per parent + channel (${AddressCollection}: ${parentKey}/${channel})`);
      if (addresses.length === 1) return addresses[0];
      return null;
    }));
  }

  /**
   * Returns all bank account addresses for a given parent (person/org).
   * @param parentKey the key of the parent model
   * @returns an Observable of AddressModel[] sorted by isFavorite descending
   */
  public listBankAccounts(parentKey: string): Observable<AddressModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'addressChannel', operator: '==', value: 'bankaccount' });
    query.push({ key: 'parentKey', operator: '==', value: parentKey });
    return this.firestoreService.searchData<AddressModel>(AddressCollection, query, 'isFavorite', 'desc');
  }

  /**
   * Returns the favourite postal address for a subject (person or org), or undefined.
   * @param parentKey the subject's okey (AddressModel.parentKey)
   */
  public getFavoritePostalAddress(parentKey: string): Observable<AddressModel | undefined> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'parentKey', operator: '==', value: parentKey });
    query.push({ key: 'addressChannel', operator: '==', value: 'postal' });
    return this.firestoreService
      .searchData<AddressModel>(AddressCollection, query, 'isFavorite', 'desc')
      .pipe(map((addresses) => addresses[0]));
  }
}
