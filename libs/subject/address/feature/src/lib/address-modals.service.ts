import { inject, Injectable } from "@angular/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { ModalController, Platform } from "@ionic/angular/standalone";

import { getModelSlug, Languages } from "@bk2/shared-categories";
import { AppStore } from "@bk2/shared-feature";
import { AddressChannel, AddressModel, DefaultLanguage, EZS_DIR } from "@bk2/shared-models";
import { ImageViewModalComponent, MapViewModalComponent, UploadService } from "@bk2/shared-ui";
import { getModelAndKey, warn } from "@bk2/shared-util-core";

import { readAsFile } from "@bk2/avatar-util";

import { AddressService, GeocodingService } from "@bk2/subject-address-data-access";
import { browseUrl, stringifyPostalAddress, isAddress } from "@bk2/subject-address-util";

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
    const modal = await this.modalController.create({
      component: AddressEditModalComponent,
      componentProps: {
        address: address,
        currentUser: this.appStore.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
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
      case AddressChannel.Email:  return browseUrl(`mailto:${address.email}`, '');
      case AddressChannel.Phone:  return browseUrl(`tel:${address.phone}`, '');
      case AddressChannel.Postal: return await this.show(address);
      case AddressChannel.Web: return browseUrl(address.url, 'https://');
      case AddressChannel.Twitter: return browseUrl(address.url, 'https://twitter.com/');
      case AddressChannel.Xing: return browseUrl(address.url, 'https://www.xing.com/profile/');
      case AddressChannel.Facebook: return browseUrl(address.url, 'https://www.facebook.com/');
      case AddressChannel.Linkedin: return browseUrl(address.url, 'https://www.linkedin.com/in/');
      case AddressChannel.Instagram: return browseUrl(address.url, 'https://www.instagram.com/');
      case AddressChannel.BankAccount: return await this.showQrPaymentSlip(address);
      default: warn('AddressModalsService.useAddress: unsupported address channel ' + address.channelType + ' for address ' + address.parentKey + '/' + address.bkey);
    }
  }

  public async show(address: AddressModel): Promise<void> {
    const addressStr = stringifyPostalAddress(address, Languages[DefaultLanguage].abbreviation);
    if (!addressStr) return;
    const coordinates = await this.geocodeService.geocodeAddress(addressStr);
    if (!coordinates) return;
    const modal = await this.modalController.create({
      component: MapViewModalComponent,
      componentProps: {
        title: addressStr,
        initialPosition: coordinates
      }
    });
    modal.present();
    await modal.onWillDismiss();
  }

  public async showQrPaymentSlip(address: AddressModel): Promise<void> {
    const modal = await this.modalController.create({
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
    modal.present();
    await modal.onWillDismiss();
  }

 /***************************  bank account / payment slip *************************** */
  /**
   * Make a photo or upload the image of a QR payment slip into Firestorage and return the download URL.
   * @param parentKey  the key of the parent model (an org or person)
   * @param parentType the type of the parent model (an org or person)
   */
  public async uploadEzs(address?: AddressModel): Promise<string | undefined> {
    if (!address) return undefined;
    const [parentModelType, parentKey] = getModelAndKey(address.parentKey);
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: this.platform.is('mobile') ? CameraSource.Prompt : CameraSource.Photos 
    });
    const file = await readAsFile(photo, this.platform);
    const path = `${this.tenantId}/${getModelSlug(parentModelType)}/${parentKey}/${EZS_DIR}/${file.name}`;
    return await this.uploadService.uploadFile(file, path, '@document.operation.upload.ezs');
  }
}
