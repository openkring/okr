import { Injectable, inject } from "@angular/core";
import { ToastController } from "@ionic/angular/standalone";
import { Observable, map, of } from "rxjs";

import { Languages } from "@bk2/shared-categories";
import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { AddressChannel, AddressModel, DefaultLanguage, UserModel } from "@bk2/shared-models";
import { die, getSystemQuery } from "@bk2/shared-util-core";

import { copyAddress, getAddressCollection } from "@bk2/subject-address-util";

@Injectable({
    providedIn: 'root'
})
export class AddressService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly toastController = inject(ToastController);

  public groupedItems$ = of([]);

  /***************************  CRUD-operations *************************** */
  /**
   * Create a new address 
   * @param address the address to store in the database. It must contain a parentKey with modelType.key.
   * @param currentUser the current user who performs the operation
   * @returns an Observable of the new or existing address or undefined if the operation failed
   */
  public async create(address: AddressModel, currentUser?: UserModel): Promise<string | undefined> {
    address.index = this.getSearchIndex(address);
    return this.firestoreService.createModel<AddressModel>(getAddressCollection(address.parentKey), address, '@subject.address.operation.create', currentUser);
}

 /**
   * Return an Observable of an Address by uid from the database.
   * @param parentKey  the key of the parent model; format:  modelType.key
   * @param addressKey the key of the address document
   * @return an Observable of the AddressModel or undefined if not found
   */
  public read(parentKey: string, addressKey: string): Observable<AddressModel | undefined> {
    return this.firestoreService.readModel<AddressModel>(getAddressCollection(parentKey), addressKey);
  }

  /**
   * Update an existing address.
   * @param address the address with new values
   * @param currentUser the current user who performs the operation
   * @param confirmMessage an optional confirmation message to show in the UI
   * @returns the key of the updated address or undefined if the operation failed
   */
  public async update(address: AddressModel, currentUser?: UserModel, confirmMessage = '@subject.address.operation.update'): Promise<string | undefined> {
    address.index = this.getSearchIndex(address);
    return await this.firestoreService.updateModel<AddressModel>(getAddressCollection(address.parentKey), address, false, confirmMessage, currentUser);
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
    await this.firestoreService.deleteModel<AddressModel>(getAddressCollection(address.parentKey), address, '@subject.address.operation.delete', currentUser);
  }

  /**
   * Return all addresses of a subject as an Observable array. The data is sorted ascending by the category.
   * @param parentKey the key of the parent object (a subject)
   */
    public list(parentKey: string, byChannel?: AddressChannel, orderBy = 'bkey', sortOrder = 'asc'): Observable<AddressModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    if (byChannel) query.push({ key: 'channelType', operator: '==', value: byChannel });
    return this.firestoreService.searchData<AddressModel>(getAddressCollection(parentKey), query, orderBy, sortOrder);
  }

  /**
   * Toggle the favorite attribute.
   * @param address the object to delete
   */
  public async toggleFavorite(address: AddressModel, currentUser?: UserModel): Promise<void> {
    address.isFavorite = !address.isFavorite; // toggle
    await this.update(address, currentUser, `@subject.address.operation.favorite.${address.isFavorite ? 'enable' : 'disable'}`);
  }

  /***************************  favorite address  *************************** */
  /**
   * Returns either the favorite address of the given channel or null if there is no favorite address for this channel.
   * @param parentKey the key of the parent subject
   * @param channel the channel type (e.g. phone, email, web) to look for
   * @returns the favorite address fo the given channel or null
   */
  public getFavoriteAddressByChannel(parentKey: string, channel: AddressChannel): Observable<AddressModel | null> {
    const query = getSystemQuery(this.env.tenantId);
    const collection = getAddressCollection(parentKey);
    query.push({ key: 'channelType', operator: '==', value: channel });
    query.push({ key: 'isFavorite', operator: '==', value: true });
    return this.firestoreService.searchData<AddressModel>(collection, query).pipe(map(addresses => {
      if (addresses.length > 1) die(`AddressUtil.getFavoriteAddressByChannel -> ERROR: only one favorite adress can exist per channel type (${collection})`);
      if (addresses.length === 1) return addresses[0];
      return null;
    }));
  }

  /**
   * Copy the address to the Clipboard.
   * @param address 
   */
  public async copy(address: AddressModel): Promise<void> {
      await copyAddress(this.toastController, address, Languages[DefaultLanguage].abbreviation);
  }

  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(address: AddressModel): string {
    switch (address.channelType) {
      case AddressChannel.Phone: 
        return `n:${address.phone}`;
      case AddressChannel.Email: 
        return `n:${address.email}`;
      case AddressChannel.Postal: 
        return `n:${address.streetName} + ${address.streetNumber}, ${address.countryCode} ${address.zipCode} ${address.city}`;
      default:
        return `n:${address.url}`;
    }
  }

  public getSearchIndexInfo(): string {
    return 'n:addressValue';
  }
}
