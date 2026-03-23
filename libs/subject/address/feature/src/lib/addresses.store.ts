import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, Platform, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, CategoryListModel, DefaultLanguage, EZS_DIR, IMAGE_STYLE_SHAPE } from '@bk2/shared-models';
import { confirm } from '@bk2/shared-util-angular';
import { chipMatches, getModelAndKey, getSystemQuery, nameMatches, warn } from '@bk2/shared-util-core';
import { Languages } from '@bk2/shared-categories';
import { getImageDimensionsFromMetadata, MapViewModalComponent, showZoomedImage, updateImageDimensions } from '@bk2/shared-ui';

import { readAsFile } from '@bk2/avatar-util';
import { UploadService } from '@bk2/avatar-data-access';

import { AddressService, GeocodingService } from '@bk2/subject-address-data-access';
import { browseUrl, copyAddress, isAddress, stringifyPostalAddress } from '@bk2/subject-address-util';

import { AddressEditModalComponent } from './address-edit.modal';

export type AddressState = {
  parentKey: string;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedChannel: string;
  orderByParam: string;
};

export const initialState: AddressState = {
  parentKey: '',

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedChannel: '',
  orderByParam: 'addressChannel'
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
        parentKey: store.parentKey(),
        orderByParam: store.orderByParam(),
      }),
      stream: ({params}) => {
        if (!params.parentKey?.length) return of([]);
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        if (params.parentKey !== 'all') { // for all we do not restrict the result set
          dbQuery.push({ key: 'parentKey', operator: '==', value: params.parentKey });
        }
        return store.appStore.firestoreService.searchData<AddressModel>(AddressCollection, dbQuery, params.orderByParam, 'asc');
      }
    }),
  })),

  withComputed((state) => {
    return {
      addresses: computed(() => state.addressesResource.value()),
      filteredAddresses: computed(() =>
        state.addressesResource.value()?.filter((address: AddressModel) =>
          nameMatches(address.index, state.searchTerm()) &&
          nameMatches(address.addressChannel, state.selectedChannel()) &&
          chipMatches(address.tags, state.selectedTag())
        ) ?? []
      ),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      imgixBaseUrl: computed(() => state.appStore.env.services.imgixBaseUrl),
      isLoading: computed(() => state.addressesResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },

      reload() {
        store.addressesResource.reload();
      },
      
      /******************************** getters          ******************************************* */
      getTags(tagName = 'address') {
        return store.appStore.getTags(tagName);
      },

      getChannels(): CategoryListModel {
        return store.appStore.getCategory('address_channel');
      },

      getUsages(): CategoryListModel {
        return store.appStore.getCategory('address_usage');
      },
    
      /******************************** setters (filter) ******************************************* */
      setParentKey(parentKey: string) {
        patchState(store, { parentKey });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedChannel(selectedChannel: string) {
        patchState(store, { selectedChannel });
      },

      setConfig(parentKey: string, orderByParam: string) {
        patchState(store, { parentKey, orderByParam });
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
            addressChannels: this.getChannels(),
            addressUsages: this.getUsages(),
            tenantId: store.tenantId(),
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

      async editSubject(parentKey: string): Promise<void> {
        const [modelType, key] = getModelAndKey(parentKey);
        if (modelType === 'org') {
          const org = store.appStore.getOrg(key);
          console.log(org);
        }
        if (modelType === 'person') {
          const person = store.appStore.getPerson(key);
          console.log(person);
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
        switch(address.addressChannel) {
          case 'email':  return browseUrl(`mailto:${address.email}`, '');
          case 'phone':  return browseUrl(`tel:${address.phone}`, '');
          case 'postal': return await this.show(address);
          case 'web': return browseUrl(address.url, 'https://');
          case 'twitter': return browseUrl(address.url, 'https://twitter.com/');
          case 'xing': return browseUrl(address.url, 'https://www.xing.com/profile/');
          case 'facebook': return browseUrl(address.url, 'https://www.facebook.com/');
          case 'linkedin': return browseUrl(address.url, 'https://www.linkedin.com/in/');
          case 'instagram': return browseUrl(address.url, 'https://www.instagram.com/');
          case 'bankaccount': return await this.showQrPaymentSlip(address.url);
          default: warn('AddressesAccordionStore.use: unsupported address channel ' + address.addressChannel + ' for address ' + address.parentKey + '/' + address.bkey);
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
