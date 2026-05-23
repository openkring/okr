import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ModalController, Platform, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';

import { FirestoreService } from '@bk2/shared-data-access';
import { STORAGE } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, AddressModelName, CategoryListModel, DefaultLanguage, DocumentModel, OrgModel, PersonModel } from '@bk2/shared-models';
import { AlertService, downloadToBrowser } from '@bk2/shared-util-angular';
import { chipMatches, getModelAndKey, getSystemQuery, nameMatches, warn } from '@bk2/shared-util-core';
import { Languages } from '@bk2/shared-categories';
import { MapViewModal } from '@bk2/shared-ui';

import { UploadService } from '@bk2/avatar-data-access';
import { DocumentService } from '@bk2/document-data-access';
import { FolderService } from '@bk2/folder-data-access';

import { AddressService, GeocodingService } from '@bk2/subject-address-data-access';
import { browseUrl, copyAddress, isAddress, stringifyPostalAddress } from '@bk2/subject-address-util';

import { AddressEditModal } from './address-edit.modal';
import { DEFAULT_MIMETYPES } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from 'libs/subject/address/feature/src/lib/scope';

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
    
const ADDRESSES_I18N_KEYS = {
  addresses:                       PFX + 'addresses',
  empty:                           PFX + 'empty',
  name:                            '@name',
  copy_conf:                       PFX + 'copy.conf',
  delete_confirm:                  PFX + 'delete.confirm',
  currency:                        PFX + 'currency',
  qrinvoice:                       PFX + 'qrinvoice',
  edit_label:                      PFX + 'update.label',
  view_label:                      PFX + 'view.label',
  create_label:                    PFX + 'create.label',
  usage_home_label:                PFX + 'usage.home.label',
  usage_work_label:                PFX + 'usage.work.label',
  usage_mobile_label:              PFX + 'usage.mobile.label',
  as_title:                        PFX + 'actionsheet.title',
  as_edit:                         PFX + 'actionsheet.edit',
  as_delete:                       PFX + 'actionsheet.delete',
  as_copy:                         PFX + 'actionsheet.copy',
  as_iban_view:                    PFX + 'actionsheet.iban.view',
  as_iban_genqr:                   PFX + 'actionsheet.iban.generate',
  as_email_send:                   PFX + 'actionsheet.email.send',
  as_phone_call:                   PFX + 'actionsheet.phone.call',
  as_postal_view:                  PFX + 'actionsheet.postal.view',
  as_file_view:                    PFX + 'actionsheet.file.view',
  as_file_upload:                  PFX + 'actionsheet.file.upload',
  as_web_open:                     PFX + 'actionsheet.web.open',
  as_subject_edit:                 PFX + 'actionsheet.subject.edit',
  cancel:                          '@cancel',
  ok:                              '@ok',
  changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  // form field keys (from @bk2/subject-address-ui AddressForm)
  bkey_label:                      '@subject/address/ui.bkey.label',
  bkey_placeholder:                '@subject/address/ui.bkey.placeholder',
  bkey_helper:                     '@subject/address/ui.bkey.helper',
  addressChannelLabel_label:       '@subject/address/ui.addressChannelLabel.label',
  addressChannelLabel_placeholder: '@subject/address/ui.addressChannelLabel.placeholder',
  addressChannelLabel_helper:      '@subject/address/ui.addressChannelLabel.helper',
  addressUsageLabel_label:         '@subject/address/ui.addressUsageLabel.label',
  addressUsageLabel_placeholder:   '@subject/address/ui.addressUsageLabel.placeholder',
  addressUsageLabel_helper:        '@subject/address/ui.addressUsageLabel.helper',
  streetName_label:                '@subject/address/ui.streetName.label',
  streetName_placeholder:          '@subject/address/ui.streetName.placeholder',
  streetName_helper:               '@subject/address/ui.streetName.helper',
  streetNumber_label:              '@subject/address/ui.streetNumber.label',
  streetNumber_placeholder:        '@subject/address/ui.streetNumber.placeholder',
  streetNumber_helper:             '@subject/address/ui.streetNumber.helper',
  addressValue2_label:             '@subject/address/ui.addressValue2.label',
  addressValue2_placeholder:       '@subject/address/ui.addressValue2.placeholder',
  addressValue2_helper:            '@subject/address/ui.addressValue2.helper',
  countryCode_label:               '@subject/address/ui.countryCode.label',
  countryCode_placeholder:         '@subject/address/ui.countryCode.placeholder',
  countryCode_helper:              '@subject/address/ui.countryCode.helper',
  zipCode_label:                   '@subject/address/ui.zipCode.label',
  zipCode_placeholder:             '@subject/address/ui.zipCode.placeholder',
  zipCode_helper:                  '@subject/address/ui.zipCode.helper',
  city_label:                      '@subject/address/ui.city.label',
  city_placeholder:                '@subject/address/ui.city.placeholder',
  city_helper:                     '@subject/address/ui.city.helper',
  url_label:                       '@subject/address/ui.url.label',
  url_placeholder:                 '@subject/address/ui.url.placeholder',
  url_helper:                      '@subject/address/ui.url.helper',
  iban_label:                      '@subject/address/ui.iban.label',
  iban_placeholder:                '@subject/address/ui.iban.placeholder',
  iban_helper:                     '@subject/address/ui.iban.helper',
  notes_label:                     '@subject/address/ui.notes.label',
  notes_placeholder:               '@subject/address/ui.notes.placeholder',
  email_label:                     '@subject/address/ui.email.label',
  email_placeholder:               '@subject/address/ui.email.placeholder',
  phone_label:                     '@subject/address/ui.phone.label',
  phone_placeholder:               '@subject/address/ui.phone.placeholder',
  isFavorite_label:                '@subject/address/ui.isFavorite.label',
  isFavorite_helper:               '@subject/address/ui.isFavorite.helper',
  isCc_label:                      '@subject/address/ui.isCc.label',
  isCc_helper:                     '@subject/address/ui.isCc.helper',
} satisfies Record<string, string>;

export type AddressesI18n = { [K in keyof typeof ADDRESSES_I18N_KEYS]: Signal<string> };

export const AddressStore = signalStore(
  withState(initialState),
  withProps(() => ({
    addressService: inject(AddressService),
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    toastController: inject(ToastController),
    geocodeService: inject(GeocodingService),
    platform: inject(Platform),
    uploadService: inject(UploadService),
    documentService: inject(DocumentService),
    folderService: inject(FolderService),
    i18nService: inject(I18nService),
    storage: inject(STORAGE),
    qrBillFn: httpsCallable<{ tenantId: string; addressBkey: string; data: Record<string, unknown> }, { storagePath: string }>(
      getFunctions(getApp(), 'europe-west6'),
      'generateQrBill'
    )
  })),
  withProps((store) => ({

    i18n: store.i18nService.translateAll(ADDRESSES_I18N_KEYS),
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

  withComputed((store) => {
    return {
      addresses: computed(() => store.addressesResource.value()),
      filteredAddresses: computed(() =>
        store.addressesResource.value()?.filter((address: AddressModel) =>
          nameMatches(address.index, store.searchTerm()) &&
          nameMatches(address.addressChannel, store.selectedChannel()) &&
          chipMatches(address.tags, store.selectedTag())
        ) ?? []
      ),
      currentUser: computed(() => store.appStore.currentUser()),
      currentPerson: computed(() => store.appStore.currentPerson()),
      defaultOrg: computed(() => store.appStore.defaultOrg()),
      tenantId: computed(() => store.appStore.tenantId()),
      imgixBaseUrl: computed(() => store.appStore.env.services.imgixBaseUrl),
      isLoading: computed(() => store.addressesResource.isLoading()),
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
        newAddress.addressUsage = store.parentKey().startsWith('org') ? 'work' : 'home';
        await this.edit(newAddress, readOnly);
      },

      /**
       * Shows a modal to edit, view (readOnly = true) or create an address.
       * @param address 
       * @param readOnly 
       */
       async edit(address: AddressModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
        component: AddressEditModal,
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
        const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
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
        await copyAddress(store.toastController, address, Languages[DefaultLanguage].abbreviation ?? 'de', store.i18n.copy_conf());
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

        const fetchPostal = async (pk: string): Promise<AddressModel | undefined> => {
          const addrs = await firstValueFrom(store.firestoreService.searchData<AddressModel>(AddressCollection, [
            { key: 'parentKey', operator: '==', value: pk },
            { key: 'addressChannel', operator: '==', value: 'postal' },
            { key: 'isFavorite', operator: '==', value: true }
          ]));
          return addrs[0];
        };

        // Resolve creditor from parent
        let creditorName = '';
        let creditorZip = '';
        const creditorPostal = await fetchPostal(address.parentKey);
        if (parentModelType === 'org') {
          const org = store.appStore.getOrg(parentKey) as OrgModel | undefined;
          creditorName = org?.name ?? '';
          creditorZip = org?.favZipCode ?? creditorPostal?.zipCode ?? '';
        } else if (parentModelType === 'person') {
          const person = store.appStore.getPerson(parentKey) as PersonModel | undefined;
          creditorName = person ? `${person.firstName} ${person.lastName}` : '';
          creditorZip = person?.favZipCode ?? creditorPostal?.zipCode ?? '';
        }
        const creditorStreet = creditorPostal?.streetName ?? '';
        const creditorStreetNumber = creditorPostal?.streetNumber ?? '';
        const creditorCity = creditorPostal?.city ?? '';
        const creditorCountry = creditorPostal?.countryCode || 'CH';

        // Resolve debtor: defaultOrg when parent != defaultOrg, else currentPerson
        const defaultOrg = store.defaultOrg() as OrgModel | undefined;
        const isCreditorDefaultOrg = parentModelType === 'org' && parentKey === defaultOrg?.bkey;
        let debtorName = '';
        let debtorZip = '';
        let debtorPostal: AddressModel | undefined;
        if (isCreditorDefaultOrg) {
          const person = store.currentPerson() as PersonModel | undefined;
          debtorName = person ? `${person.firstName} ${person.lastName}` : '';
          debtorZip = person?.favZipCode ?? '';
          if (person?.bkey) debtorPostal = await fetchPostal('person.' + person.bkey);
        } else {
          debtorName = defaultOrg?.name ?? '';
          debtorZip = defaultOrg?.favZipCode ?? '';
          if (defaultOrg?.bkey) debtorPostal = await fetchPostal('org.' + defaultOrg.bkey);
        }
        const debtorStreet = debtorPostal?.streetName ?? '';
        const debtorStreetNumber = debtorPostal?.streetNumber ?? '';
        const debtorCity = debtorPostal?.city ?? '';
        const debtorCountry = debtorPostal?.countryCode || 'CH';

        const data: Record<string, unknown> = {
          currency: store.i18n.currency(),
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
        doc.title = store.i18n.qrinvoice() + ' ' + creditorName;
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
          case 'web': return browseUrl(address.url.startsWith('https://') ? address.url : 'https://' + address.url);
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
        const addressStr = stringifyPostalAddress(address, Languages[DefaultLanguage].abbreviation ?? 'de');
        if (!addressStr) return;
        const coordinates = await store.geocodeService.geocodeAddress(addressStr);
        if (!coordinates) return;
        const modal = await store.modalController.create({
          component: MapViewModal,
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
