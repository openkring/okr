import { inject, Injectable } from "@angular/core";
import { ModalController, Platform } from "@ionic/angular/standalone";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

import { AppStore } from "@bk2/shared/feature";
import { AddressChannel, AddressModel, DefaultLanguage, EZS_DIR } from "@bk2/shared/models";
import { getModelSlug, Languages } from "@bk2/shared/categories";
import { ImageViewModalComponent, MapViewModalComponent, UploadService } from "@bk2/shared/ui";
import { getModelAndKey, warn } from "@bk2/shared/util-core";

import { readAsFile } from "@bk2/avatar/util";

import { AddressService, GeocodingService } from "@bk2/subject/address/data-access";
import { browseUrl, getStringifiedPostalAddress, isAddress } from "@bk2/subject/address/util";
import { AddressEditModalComponent } from "./address-edit.modal";

@Injectable({
    providedIn: 'root'
})
export class AddressModalsService {
  private readonly modalController = inject(ModalController);
  public readonly appStore = inject(AppStore);
  private readonly addressService = inject(AddressService);
  private readonly geocodeService = inject(GeocodingService);
  private readonly platform = inject(Platform);
  private readonly uploadService = inject(UploadService);

  public readonly tenantId = this.appStore.env.tenantId;

  /***************************  edit modal  *************************** */
  public async edit(address: AddressModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: AddressEditModalComponent,
      componentProps: {
        address: address,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isAddress(data, this.tenantId)) {
        await (!data.bkey ? 
          this.addressService.create(data, this.appStore.currentUser()) : 
          this.addressService.update(data, this.appStore.currentUser()));
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
      default: warn('AddressModalsService.useAddress: unsupported address channel ' + address.channelType + ' for address ' + address.addressValue + '/' + address.bkey);
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
    const _file = await readAsFile(_photo, this.platform);
    const _path = `${this.tenantId}/${getModelSlug(_parentModelType)}/${_parentKey}/${EZS_DIR}/${_file.name}`;
    return await this.uploadService.uploadFile(_file, _path, '@document.operation.upload.ezs');
  }
}
