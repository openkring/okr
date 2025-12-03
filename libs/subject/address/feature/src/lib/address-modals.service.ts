import { inject, Injectable } from "@angular/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { ModalController, Platform } from "@ionic/angular/standalone";

import { Languages } from "@bk2/shared-categories";
import { AppStore } from "@bk2/shared-feature";
import { AddressChannel, AddressModel, DefaultLanguage, EZS_DIR, ImageAction, newImage } from "@bk2/shared-models";
import { getImageDimensionsFromMetadata, MapViewModalComponent, showZoomedImage, updateImageDimensions } from "@bk2/shared-ui";
import { getModelAndKey, warn } from "@bk2/shared-util-core";

import { readAsFile } from "@bk2/avatar-util";
import { UploadService } from "@bk2/avatar-data-access";

import { GeocodingService } from "@bk2/subject-address-data-access";
import { browseUrl, stringifyPostalAddress } from "@bk2/subject-address-util";

@Injectable({
    providedIn: 'root'
})
export class AddressModalsService {
  private readonly modalController = inject(ModalController);
  public readonly appStore = inject(AppStore);
  private readonly geocodeService = inject(GeocodingService);
  private readonly platform = inject(Platform);
  private readonly uploadService = inject(UploadService);

  public readonly tenantId = this.appStore.env.tenantId;


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
      case AddressChannel.BankAccount: return await this.showQrPaymentSlip(address.url);
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

  public async showQrPaymentSlip(path: string): Promise<void> {
    const title = 'QR Rechnung';
    if (path && path.length > 0) {
      let dimensions = await getImageDimensionsFromMetadata(path);

      // if we can not read the dimensions from the image meta data, calculate them from the image file and upload as metadata to firebase storage
      if (!dimensions) {
        dimensions = await updateImageDimensions(path, this.appStore.currentUser());
      }
      
      // if we have valid dimensions, show the zoomed image in a modal
      if (dimensions) {
        const image = newImage(title, path, path);
        image.width = parseInt(dimensions.width);
        image.height = parseInt(dimensions.height);
        image.imageAction = ImageAction.Zoom;
        await showZoomedImage(this.modalController, title, image, 'zoom-modal');     
      }
    }
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
    const path = `${this.tenantId}/${parentModelType}/${parentKey}/${EZS_DIR}/${file.name}`;
    return await this.uploadService.uploadFile(file, path, '@document.operation.upload.ezs');
  }
}
