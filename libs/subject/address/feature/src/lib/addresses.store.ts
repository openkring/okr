import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, Platform, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressChannel, AddressCollection, AddressModel, DefaultLanguage, EZS_DIR, IMAGE_STYLE_SHAPE } from '@bk2/shared-models';
import { confirm } from '@bk2/shared-util-angular';
import { getModelAndKey, getSystemQuery, warn } from '@bk2/shared-util-core';
import { Languages } from '@bk2/shared-categories';
import { getImageDimensionsFromMetadata, MapViewModalComponent, showZoomedImage, updateImageDimensions } from '@bk2/shared-ui';

import { readAsFile } from '@bk2/avatar-util';
import { UploadService } from '@bk2/avatar-data-access';

import { AddressService, GeocodingService } from '@bk2/subject-address-data-access';
import { browseUrl, copyAddress, isAddress, stringifyPostalAddress } from '@bk2/subject-address-util';

import { AddressEditModalComponent } from './address-edit.modal';

export type AddressState = {
  parentKey: string;
};

export const initialState: AddressState = {
  parentKey: ''
};
    
export const AddressStore = signalStore(
  withState(initialState),
  withProps(() => ({
    addressService: inject(AddressService),
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    geocodeService: inject(GeocodingService),
    platform: inject(Platform),
    uploadService: inject(UploadService)
  })),
  withProps((store) => ({
    addressesResource: rxResource({
      params: () => ({
        parentKey: store.parentKey()
      }),
      stream: ({params}) => {
        if (!params.parentKey?.length) return of([]);
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        dbQuery.push({ key: 'parentKey', operator: '==', value: params.parentKey });
        return store.appStore.firestoreService.searchData<AddressModel>(AddressCollection, dbQuery, 'channelType', 'asc');
      }
    }),
  })),

  withComputed((state) => {
    return {
      addresses: computed(() => state.addressesResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      imgixBaseUrl: computed(() => state.appStore.env.services.imgixBaseUrl),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.addressesResource.reload();
      },

      reload() {
        store.addressesResource.reload();
      },
      
      /******************************** getters          ******************************************* */
      getTags(tagName = 'address') {
        return store.appStore.getTags(tagName);
      },


    
      /******************************** setters (filter) ******************************************* */
      setParentKey(parentKey: string) {
        patchState(store, { parentKey });
      },

      /******************************* actions *************************************** */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const newAddress = new AddressModel(store.tenantId());
        newAddress.parentKey = store.parentKey();
        await this.edit(newAddress, readOnly);
      },

      /**
       * Shows a modal to edit, view (readOnly = true) or create an address.
       * @param address 
       * @param readOnly 
       */
       async edit(address: AddressModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
        component: AddressEditModalComponent,
        componentProps: {
            address,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            readOnly
        }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data && !readOnly) {
        if (isAddress(data, store.tenantId())) {
            await (!data.bkey ? 
              store.addressService.create(data, store.currentUser()) : 
              store.addressService.update(data, store.currentUser()));
            this.reload();
        }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`AddressesAccordionStore.export(${type}) ist not yet implemented`);
      },

      async delete(address?: AddressModel, readOnly = true): Promise<void> {
        if (!address || readOnly) return;
        const result = await confirm(store.alertController, '@subject.address.operation.delete.askConfirmation', true);
        if (result === true) {
          await store.addressService.delete(address, store.currentUser());
          this.reload();
        }
      },

     /**
      * Copy the address to the Clipboard.
      * @param address 
      */
      async copy(address: AddressModel): Promise<void> {
        await copyAddress(store.toastController, address, Languages[DefaultLanguage].abbreviation);
      },

      async sendEmail(email: string): Promise<void> {
        return await browseUrl(`mailto:${email}`);
      },
      
      async call(phone: string): Promise<void> {
        return await browseUrl(`tel:${phone}`);
      },

      async showPostalAddress(address: AddressModel): Promise<void> {
        return await this.show(address);
      },

      async uploadQrEzs(address: AddressModel, readOnly = true): Promise<string | undefined> {
        if (!address || readOnly) return undefined;
        const url = await this.uploadEzs(address);
        if (url) {
          address.url = url;
          await store.addressService.update(address, store.currentUser());
        }
        return url;
      },

      async showQrEzs(address: AddressModel): Promise<void> {
        return await this.showQrPaymentSlip(address.url);
      },

      async openUrl(address: AddressModel): Promise<void> {
        await this.use(address);
      },

      /***************************  use an address *************************** */
      /**
       * Use an address, e.g. browse to a web address or call a phone number.
       * @param address 
       */
      async use(address: AddressModel): Promise<void> {
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
          default: warn('AddressesAccordionStore.use: unsupported address channel ' + address.channelType + ' for address ' + address.parentKey + '/' + address.bkey);
        }
      },

      async show(address: AddressModel): Promise<void> {
        const addressStr = stringifyPostalAddress(address, Languages[DefaultLanguage].abbreviation);
        if (!addressStr) return;
        const coordinates = await store.geocodeService.geocodeAddress(addressStr);
        if (!coordinates) return;
        const modal = await store.modalController.create({
          component: MapViewModalComponent,
          componentProps: {
            title: addressStr,
            initialPosition: coordinates
          }
        });
        modal.present();
        await modal.onWillDismiss();
      },

      async showQrPaymentSlip(path: string): Promise<void> {
        const title = 'QR Rechnung';
        if (path && path.length > 0) {
          let dimensions = await getImageDimensionsFromMetadata(path);

          // if we can not read the dimensions from the image meta data, calculate them from the image file and upload as metadata to firebase storage
          if (!dimensions) {
            dimensions = await updateImageDimensions(path, store.currentUser());
          }
          
          // if we have valid dimensions, show the zoomed image in a modal
          if (dimensions) {
            const style = IMAGE_STYLE_SHAPE;
            style.width = dimensions.width;
            style.height = dimensions.height;
            await showZoomedImage(store.modalController, path, title, style, 'zoom-modal');     
          }
        }
      },

       /***************************  bank account / payment slip *************************** */
      /**
       * Make a photo or upload the image of a QR payment slip into Firestorage and return the download URL.
       * @param parentKey  the key of the parent model (an org or person)
       * @param parentType the type of the parent model (an org or person)
       */
      async uploadEzs(address?: AddressModel): Promise<string | undefined> {
        if (!address) return undefined;
        const [parentModelType, parentKey] = getModelAndKey(address.parentKey);
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: store.platform.is('mobile') ? CameraSource.Prompt : CameraSource.Photos 
        });
        const file = await readAsFile(photo, store.platform);
        const path = `${store.tenantId}/${parentModelType}/${parentKey}/${EZS_DIR}/${file.name}`;
        return await store.uploadService.uploadFile(file, path, '@document.operation.upload.ezs');
      }
    }
  })
);
