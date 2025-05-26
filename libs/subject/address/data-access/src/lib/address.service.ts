import { Injectable, inject } from "@angular/core";
import { Observable, map, of } from "rxjs";
import { ModalController, Platform, ToastController } from "@ionic/angular/standalone";
import { Camera, CameraResultType, CameraSource, Photo } from "@capacitor/camera";

import { ENV, FIRESTORE } from "@bk2/shared/config";
import { AddressChannel, AddressModel, DefaultLanguage, EZS_DIR, ModelType, UserModel } from "@bk2/shared/models";
import { createModel, die, getModelAndKey, getSystemQuery, readModel, searchData, updateModel, warn } from "@bk2/shared/util";
import { getModelSlug, Languages } from "@bk2/shared/categories";
import { error } from "@bk2/shared/i18n";

import { saveComment } from "@bk2/comment/util";
import { readAsFile } from "@bk2/avatar/util";

import { browseUrl, copyAddress, getAddressCollection, getStringifiedPostalAddress, isAddress } from "@bk2/address/util";
import { GeocodingService } from "./geocode.service";

@Injectable({
    providedIn: 'root'
})
export class AddressService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);

  private readonly geocodeService = inject(GeocodingService);
  private readonly platform = inject(Platform);

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

  /***************************  edit modal  *************************** */
  public async edit(address: AddressModel, currentUser?: UserModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: AddressEditModalComponent,
      componentProps: {
        address: address,
        currentUser: currentUser
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isAddress(data, this.tenantId)) {
        await (!data.bkey ? this.create(data, currentUser) : this.update(data));
      }
    }
  }
  
  /***************************  use an address *************************** */
  /**
   * Use an address, e.g. browse to a web address or call a phone number.
   * @param address 
   */
  public async use(address: AddressModel): Promise<void> {
    switch(address.channelType) {
      case AddressChannel.Email:  return browseUrl(`mailto:${address.addressValue}`, '');
      case AddressChannel.Phone:  return browseUrl(`tel:${address.addressValue}`, '');
      case AddressChannel.Postal: return await this.show(address);
      case AddressChannel.Web: return browseUrl(address.addressValue, 'https://');
      case AddressChannel.Twitter: return browseUrl(address.addressValue, 'https://twitter.com/');
      case AddressChannel.Xing: return browseUrl(address.addressValue, 'https://www.xing.com/profile/');
      case AddressChannel.Facebook: return browseUrl(address.addressValue, 'https://www.facebook.com/');
      case AddressChannel.Linkedin: return browseUrl(address.addressValue, 'https://www.linkedin.com/in/');
      case AddressChannel.Instagram: return browseUrl(address.addressValue, 'https://www.instagram.com/');
      case AddressChannel.BankAccount: return await this.showQrPaymentSlip(address);
      default: warn('AddressService.useAddress: unsupported address channel ' + address.channelType + ' for address ' + address.addressValue + '/' + address.bkey);
    }
  }

  public async show(address: AddressModel): Promise<void> {
    const _addressStr = getStringifiedPostalAddress(address, Languages[DefaultLanguage].abbreviation);
    if (!_addressStr) return;
    const _coordinates = await this.geocodeService.geocodeAddress(_addressStr);
    if (!_coordinates) return;
    const _modal = await this.modalController.create({
      component: MapViewModalComponent,
      componentProps: {
        title: _addressStr,
        initialPosition: _coordinates
      }
    });
    _modal.present();
    await _modal.onWillDismiss();
    // temporary solution
    //const _url = `https://www.google.com/maps/search/?api=1&query=${_addressStr}`;
    //window.open(_url, '_blank');

    // route: 
    // https://www.google.com/maps/dir/47.2455199,8.710301/47.366659,8.550004/@47.3037508,8.4689009,11z?entry=ttu
  }

  public async showQrPaymentSlip(address: AddressModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: ImageViewModalComponent,
      componentProps: {
        title: "QR Einzahlungsschein",
        image: {
          url: address.url,
          imageLabel: '',
          downloadUrl: '',
          imageOverlay: '',
          altText: 'QR Code of Payment Slip',
          isThumbnail: false,
          isZoomable: false,
          hasPriority: true,
          fill: true,
          sizes: '(max-width: 786px) 50vw, 100vw',
        }}
    });
    _modal.present();
    await _modal.onWillDismiss();
  }

  /**
   * Copy the address to the Clipboard.
   * @param address 
   */
  public async copy(address: AddressModel): Promise<void> {
      await copyAddress(this.toastController, this.env.settingsDefaults.toastLength, address, Languages[DefaultLanguage].abbreviation);
  }

  /***************************  bank account / payment slip *************************** */
  /**
   * Make a photo or upload the image of a QR payment slip into Firestorage and return the download URL.
   * @param parentKey  the key of the parent model (an org or person)
   * @param parentType the type of the parent model (an org or person)
   */
  public async uploadEzs(address?: AddressModel): Promise<string | undefined> {
    if (!address) return undefined;
    const [_parentModelType, _parentKey] = getModelAndKey(address.parentKey);
    const _photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: this.platform.is('mobile') ? CameraSource.Prompt : CameraSource.Photos 
    });
    return this.uploadFile(_photo, _parentKey, _parentModelType);
  }

  /**
   * Upload the image of the payment slip into Firestorage and return the download URL.
   * @param photo the photo of the payment slip
   * @param parentKey the key of the parent model (an org or person)
   * @param parentType the type of the parent model (an org or person)
   * @returns the download URL of the uploaded image
   */
  protected async uploadFile(photo: Photo, parentKey: string, parentType: ModelType): Promise<string | undefined> {
    const _file = await readAsFile(photo, this.platform);
    const _path = this.getDocumentStoragePath(parentKey, parentType);
    const _modal = await this.modalController.create({
      component: UploadTaskComponent,
      cssClass: 'upload-modal',
      componentProps: {
        file: _file,
        fullPath: _path + '/' + _file.name,
        title: '@document.operation.upload.ezs'
      }
    });
    _modal.present();
    try {
      const { data, role } = await _modal.onWillDismiss();    // data contains the Firestorage download URL
      if (role === 'confirm') {
        return data as string;    // return the firebase storage download URL
      }
    }
    catch (_ex) {
      error(undefined, 'AddressService.uploadFile -> ERROR: ' + JSON.stringify(_ex));
    }
    return undefined;
  }

  /**
   * Construct the path to the location of the payment slip in Firestorage.
   * tenant / model-slug: person | org / parent-key / ezs / file name
   * @param parentKey 
   * @param parentType 
   * @returns 
   */
  private getDocumentStoragePath(parentKey: string, parentType: ModelType): string {
    return `${this.env.owner.tenantId}/${getModelSlug(parentType)}/${parentKey}/${EZS_DIR}`;
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
