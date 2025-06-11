import { Injectable, inject } from "@angular/core";
import { Observable, map, of } from "rxjs";
import { ToastController } from "@ionic/angular/standalone";

import { ENV, FIRESTORE } from "@bk2/shared/config";
import { AddressChannel, AddressModel, DefaultLanguage, UserModel } from "@bk2/shared/models";
import { createModel, die, getSystemQuery, readModel, searchData, updateModel } from "@bk2/shared/util";
import { Languages } from "@bk2/shared/categories";

import { saveComment } from "@bk2/comment/util";

import { copyAddress, getAddressCollection } from "@bk2/address/util";

@Injectable({
    providedIn: 'root'
})
export class AddressService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.owner.tenantId;

  public groupedItems$ = of([]);

  /***************************  CRUD-operations *************************** */
  /**
   * Create a new address 
   * @param address the address to store in the database. It must contain a parentKey with modelType.key.
   * @returns an Observable of the new or existing address.
   */
  public async create(address: AddressModel, currentUser?: UserModel): Promise<string> {
    address.index = this.getSearchIndex(address);
    const _collection = getAddressCollection(address.parentKey);
    const _key = await createModel(this.firestore, _collection, address, this.tenantId, '@subject.address.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, _collection, _key, '@comment.operation.initial.conf');
    return _key;    
}

 /**
   * Return an Observable of an Address by uid from the database.
   * @param parentKey  the key of the parent model; format:  modelType.key
   * @param addressKey the key of the address document
   */
  public read(parentKey: string, addressKey: string): Observable<AddressModel | undefined> {
    const _collection = getAddressCollection(parentKey);
    return readModel(this.firestore, _collection, addressKey) as Observable<AddressModel>;
  }

  /**
   * Update an existing address.
   * @param address the address with new values
   * @returns the key of the updated address
   */
  public async update(address: AddressModel, confirmMessage = '@subject.address.operation.update'): Promise<string> {
    address.index = this.getSearchIndex(address);
    const _collection = getAddressCollection(address.parentKey);
    return await updateModel(this.firestore, _collection, address, confirmMessage, this.toastController);  
  }

  /**
   * Delete an address.
   * We don't delete addresses finally. Instead we deactivate/archive the objects.
   * Admin user may finally delete objects directly in the database.
   * @param address the object to delete
   */
  public async delete(address: AddressModel): Promise<void> {
    address.isArchived = true;
    this.update(address, '@subject.address.operation.delete');
  }

  /**
   * Return all addresses of a subject as an Observable array. The data is sorted ascending by the category.
   * @param parentKey the key of the parent object (a subject)
   */
    public list(parentKey: string, byChannel?: AddressChannel, orderBy = 'bkey', sortOrder = 'asc'): Observable<AddressModel[]> {
    const _collection = getAddressCollection(parentKey);
    const _query = getSystemQuery(this.tenantId);
    if (byChannel) _query.push({ key: 'channelType', operator: '==', value: byChannel });
    return searchData<AddressModel>(this.firestore, _collection, _query, orderBy, sortOrder);
  }

  /**
   * Toggle the favorite attribute.
   * @param address the object to delete
   */
  public async toggleFavorite(address: AddressModel): Promise<void> {
    address.isFavorite = !address.isFavorite; // toggle
    await this.update(address, `@subject.address.operation.favorite.${address.isFavorite ? 'enable' : 'disable'}`);
  }

  /***************************  favorite address  *************************** */
  /**
   * Returns either the favorite address of the given channel or null if there is no favorite address for this channel.
   * @param parentKey the key of the parent subject
   * @param channel the channel type (e.g. phone, email, web) to look for
   * @returns the favorite address fo the given channel or null
   */
  public getFavoriteAddressByChannel(parentKey: string, channel: AddressChannel): Observable<AddressModel | null> {
    const _collection = getAddressCollection(parentKey);
    const _query = getSystemQuery(this.tenantId);
    _query.push({ key: 'channelType', operator: '==', value: channel });
    _query.push({ key: 'isFavorite', operator: '==', value: true });
    return searchData<AddressModel>(this.firestore, _collection, _query).pipe(map(_addresses => {
      if (_addresses.length > 1) die(`AddressUtil.getFavoriteAddressByChannel -> ERROR: only one favorite adress can exist per channel type (${_collection})`);
      if (_addresses.length === 1) return _addresses[0];
      return null;
    }));
  }

  /**
   * Copy the address to the Clipboard.
   * @param address 
   */
  public async copy(address: AddressModel): Promise<void> {
      await copyAddress(this.toastController, this.env.settingsDefaults.toastLength, address, Languages[DefaultLanguage].abbreviation);
  }

  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(address: AddressModel): string {
    return (address.channelType === AddressChannel.Postal) ?
    `n:${address.addressValue}, ${address.countryCode} ${address.zipCode} ${address.city}` :
    `n:${address.addressValue}`;
  }

  public getSearchIndexInfo(): string {
    return 'n:addressValue';
  }
}
