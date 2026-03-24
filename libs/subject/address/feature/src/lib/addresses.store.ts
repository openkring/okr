import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, Platform, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';

import { FirestoreService } from '@bk2/shared-data-access';
import { STORAGE } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, AddressModelName, CategoryListModel, DefaultLanguage, DocumentModel, EZS_DIR, IMAGE_STYLE_SHAPE, OrgModel, PersonModel } from '@bk2/shared-models';
import { confirm, downloadToBrowser } from '@bk2/shared-util-angular';
import { chipMatches, getModelAndKey, getSystemQuery, nameMatches, warn } from '@bk2/shared-util-core';
import { Languages } from '@bk2/shared-categories';
import { getImageDimensionsFromMetadata, MapViewModalComponent, showZoomedImage, updateImageDimensions } from '@bk2/shared-ui';

import { readAsFile } from '@bk2/avatar-util';
import { UploadService } from '@bk2/avatar-data-access';
import { DocumentService } from '@bk2/document-data-access';
import { FolderService } from '@bk2/folder-data-access';

import { AddressService, GeocodingService } from '@bk2/subject-address-data-access';
import { browseUrl, copyAddress, isAddress, stringifyPostalAddress } from '@bk2/subject-address-util';

import { AddressEditModalComponent } from './address-edit.modal';
import { DEFAULT_MIMETYPES } from '@bk2/shared-constants';

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
    uploadService: inject(UploadService),
    documentService: inject(DocumentService),
    folderService: inject(FolderService),
    storage: inject(STORAGE),
    qrBillFn: httpsCallable<{ tenantId: string; addressBkey: string; data: Record<string, unknown> }, { storagePath: string }>(
      getFunctions(getApp(), 'europe-west6'),
      'generateQrBill'
    )
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
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultOrg: computed(() => state.appStore.defaultOrg()),
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
        if (selectedChannel === 'all') selectedChannel = '';
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

      /**
       * Generates a Swiss QR bill PDF via Cloud Function, uploads it to Storage,
       * creates a DocumentModel and updates address.url with the download URL.
       * Creditor = parent org/person of the address.
       * Debtor = defaultOrg when parent != defaultOrg, else currentPerson.
       */
      async generateQrEzs(address: AddressModel): Promise<void> {
        const tenantId = store.tenantId();
        const [parentModelType, parentKey] = getModelAndKey(address.parentKey);

        // Resolve creditor from parent
        let creditorName = '';
        let creditorStreet = '';
        let creditorStreetNumber = '';
        let creditorZip = '';
        let creditorCity = '';
        let creditorCountry = 'CH';
        if (parentModelType === 'org') {
          const org = store.appStore.getOrg(parentKey) as OrgModel | undefined;
          creditorName = org?.name ?? '';
          creditorStreet = org?.favStreetName ?? '';
          creditorStreetNumber = org?.favStreetNumber ?? '';
          creditorZip = org?.favZipCode ?? '';
          creditorCity = org?.favCity ?? '';
          creditorCountry = org?.favCountryCode || 'CH';
        } else if (parentModelType === 'person') {
          const person = store.appStore.getPerson(parentKey) as PersonModel | undefined;
          creditorName = person ? `${person.firstName} ${person.lastName}` : '';
          creditorStreet = person?.favStreetName ?? '';
          creditorStreetNumber = person?.favStreetNumber ?? '';
          creditorZip = person?.favZipCode ?? '';
          creditorCity = person?.favCity ?? '';
          creditorCountry = person?.favCountryCode || 'CH';
        }

        // Resolve debtor: defaultOrg when parent != defaultOrg, else currentPerson
        const defaultOrg = store.defaultOrg() as OrgModel | undefined;
        const isCreditorDefaultOrg = parentModelType === 'org' && parentKey === defaultOrg?.bkey;
        let debtorName = '';
        let debtorStreet = '';
        let debtorStreetNumber = '';
        let debtorZip = '';
        let debtorCity = '';
        let debtorCountry = 'CH';
        if (isCreditorDefaultOrg) {
          const person = store.currentPerson() as PersonModel | undefined;
          debtorName = person ? `${person.firstName} ${person.lastName}` : '';
          debtorStreet = person?.favStreetName ?? '';
          debtorStreetNumber = person?.favStreetNumber ?? '';
          debtorZip = person?.favZipCode ?? '';
          debtorCity = person?.favCity ?? '';
          debtorCountry = person?.favCountryCode || 'CH';
        } else {
          debtorName = defaultOrg?.name ?? '';
          debtorStreet = defaultOrg?.favStreetName ?? '';
          debtorStreetNumber = defaultOrg?.favStreetNumber ?? '';
          debtorZip = defaultOrg?.favZipCode ?? '';
          debtorCity = defaultOrg?.favCity ?? '';
          debtorCountry = defaultOrg?.favCountryCode || 'CH';
        }

        const data: Record<string, unknown> = {
          currency: 'CHF',
          creditor: {
            account: address.iban,
            name: creditorName,
            address: `${creditorStreet} ${creditorStreetNumber}`,
            city: creditorCity,
            zip: creditorZip,
            country: creditorCountry,
          },
          debtor: {
            name: debtorName,
            address: `${debtorStreet} ${debtorStreetNumber}`,
            city: debtorCity,
            zip: debtorZip,
            country: debtorCountry,
          },
        };

        const result = await store.qrBillFn({ tenantId, addressBkey: address.bkey, data });
        const { storagePath } = result.data;

        // Get download URL via client SDK
        const url = await getDownloadURL(ref(store.storage, storagePath));

        // Ensure 'ezs' folder exists, then link document to it
        const ezsKey = 'ezs';
        await store.folderService.ensureGroupFolder(ezsKey, 'EZS', tenantId, store.currentUser());

        // Create and save DocumentModel
        const doc = new DocumentModel(tenantId);
        doc.fullPath = storagePath;
        doc.mimeType = 'application/pdf';
        doc.url = url;
        doc.title = `QR-Rechnung ${creditorName}`;
        doc.folderKeys = [ezsKey];
        await store.documentService.create(doc, store.currentUser());

        // Update address with the new URL
        address.url = url;
        await store.addressService.update(address, store.currentUser());
        this.reload();
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
          case 'bankaccount': return await downloadToBrowser(address.url);
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

      async uploadFile(address?: AddressModel): Promise<string | undefined> {
        if (!address) return undefined;
        const tid = store.tenantId();
        const path = 'tenant/' + tid + '/' + AddressModelName;
        const doc = await store.uploadService.uploadAndCreateDocument(tid, DEFAULT_MIMETYPES, path)

        // Update address with the new URL
        if (!doc) return undefined;
        address.url = doc.url;
        await store.addressService.update(address, store.currentUser());
        this.reload();
      }
    }
  })
);
