import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ModalController, Platform, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map, of } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';

import { FirestoreService } from '@okr/shared-data-access';
import { STORAGE } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { AddressCollection, AddressDirectoryCollection, AddressDirectoryModel, AddressModel, AddressModelName, CategoryListModel, DefaultLanguage, DocumentModel, getAddressDirectoryKey, isSensitiveScalarChannel, OrgModel, PersonModel } from '@okr/shared-models';
import { AlertService, downloadToBrowser } from '@okr/shared-util-angular';
import { chipMatches, getModelAndKey, getSystemQuery, nameMatches, warn } from '@okr/shared-util-core';
import { Languages } from '@okr/shared-categories';
import { MapViewModal } from '@okr/shared-ui';

import { UploadService } from '@okr/avatar-data-access';
import { DocumentService } from '@okr/document-data-access';
import { FolderService } from '@okr/folder-data-access';

import { AddressService, GeocodingService } from '@okr/subject-address-data-access';
import { ADDRESSES_I18N_KEYS, browseUrl, copyAddress, directoryEntryToAddress, getWebUrl, isAddress, openExternalUrl, readsAddressVault, shouldBecomeFavorite, stringifyPostalAddress } from '@okr/subject-address-util';

import { AddressEditModal } from './address-edit.modal';
import { DEFAULT_MIMETYPES } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';

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
    alertService: inject(AlertService),
    toastController: inject(ToastController),
    geocodeService: inject(GeocodingService),
    platform: inject(Platform),
    uploadService: inject(UploadService),
    documentService: inject(DocumentService),
    folderService: inject(FolderService),
    i18n: inject(I18nService).translateAll(ADDRESSES_I18N_KEYS),
    storage: inject(STORAGE),
    qrBillFn: httpsCallable<{ tenantId: string; addressOkey: string; data: Record<string, unknown> }, { storagePath: string }>(
      getFunctions(getApp(), 'europe-west6'),
      'generateQrBill'
    )
  })),
  withProps((store) => ({
    addressesResource: rxResource({
      params: () => ({
        parentKey: store.parentKey(),
        orderByParam: store.orderByParam(),
        currentUser: store.appStore.currentUser(),
        tenantId: store.appStore.tenantId(),
      }),
      stream: ({params}) => {
        if (!params.parentKey?.length) return of([]);
        // Gate on the LOADED UserModel (and tenantId) before touching Firestore — same
        // rationale as the AppStore resources: firing while currentUser is still
        // resolving picks the WRONG tier below (readsAddressVault sees `undefined` and
        // falls to the directory branch), so the cold load subscribes to one listener
        // and then immediately tears it down and opens another when currentUser lands.
        // That attach/detach churn on a single watch stream is what tripped the
        // Firestore target-management race (SCS-1S: assertion ca9, ve:-1).
        if (!params.currentUser || !params.tenantId) return of([]);
        // Tiered source (spec 1.19 Phase 4 §A4): after the Phase 4 rules flip the raw
        // addresses collection is readable by the owner, privileged, and memberAdmin
        // (D-P4-1 as amended 2026-07-27 — memberAdmin maintains member contact data,
        // so a read-only projection would break that job); plain members stream the
        // address-directory projection and see exactly the registered-visible
        // entries. 'all' stays raw — that list route is admin-guarded.
        if (readsAddressVault(params.currentUser, params.parentKey)) {
          const dbQuery = getSystemQuery(params.tenantId);
          if (params.parentKey !== 'all') { // for all we do not restrict the result set
            dbQuery.push({ key: 'parentKey', operator: '==', value: params.parentKey });
          }
          return store.appStore.firestoreService.searchData<AddressModel>(AddressCollection, dbQuery, params.orderByParam, 'asc');
        }
        const directoryKey = getAddressDirectoryKey(params.tenantId, params.parentKey);
        return store.appStore.firestoreService.readModel<AddressDirectoryModel>(AddressDirectoryCollection, directoryKey).pipe(
          map((directory) => (directory?.entries ?? []).map((entry) =>
            directoryEntryToAddress(entry, params.tenantId, params.parentKey)))
        );
      }
    }),
  })),

  withComputed((store) => {
    // Exclude the sensitive scalar channels (ssn/dob) from the contact UI — they
    // share the person's parentKey but are not contact channels (spec 1.19).
    const contactAddresses = computed(() =>
      store.addressesResource.value()?.filter((a: AddressModel) => !isSensitiveScalarChannel(a.addressChannel))
    );
    return {
      addresses: contactAddresses,
      filteredAddresses: computed(() =>
        contactAddresses()?.filter((address: AddressModel) =>
          nameMatches(address.index, store.searchTerm()) &&
          nameMatches(address.addressChannel, store.selectedChannel()) &&
          chipMatches(address.tags, store.selectedTag())
        ) ?? []
      ),
      currentUser: computed(() => store.appStore.currentUser()),
      // reading the projection means seeing exactly one address per channel — the
      // favorite. Marking it with a star would be noise: they are all favorites.
      readsVault: computed(() => readsAddressVault(store.appStore.currentUser(), store.parentKey())),
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
            if (!data.okey) {
              // make the person's choice explicit rather than leaving the channel
              // to the projection's fallback (see shouldBecomeFavorite)
              if (shouldBecomeFavorite(data, store.addresses() ?? [])) data.isFavorite = true;
              await store.addressService.create(data, store.currentUser());
            } else {
              await store.addressService.update(data, store.currentUser());
            }
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
          const dbQuery = getSystemQuery(tenantId);
          dbQuery.push({ key: 'parentKey', operator: '==', value: pk });
          dbQuery.push({ key: 'addressChannel', operator: '==', value: 'postal' });
          dbQuery.push({ key: 'isFavorite', operator: '==', value: true });
          const addrs = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, dbQuery, 'none');
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
        const isCreditorDefaultOrg = parentModelType === 'org' && parentKey === defaultOrg?.okey;
        let debtorName = '';
        let debtorZip = '';
        let debtorPostal: AddressModel | undefined;
        if (isCreditorDefaultOrg) {
          const person = store.currentPerson() as PersonModel | undefined;
          debtorName = person ? `${person.firstName} ${person.lastName}` : '';
          debtorZip = person?.favZipCode ?? '';
          if (person?.okey) debtorPostal = await fetchPostal('person.' + person.okey);
        } else {
          debtorName = defaultOrg?.name ?? '';
          debtorZip = defaultOrg?.favZipCode ?? '';
          if (defaultOrg?.okey) debtorPostal = await fetchPostal('org.' + defaultOrg.okey);
        }
        const debtorStreet = debtorPostal?.streetName ?? '';
        const debtorStreetNumber = debtorPostal?.streetNumber ?? '';
        const debtorCity = debtorPostal?.city ?? '';
        const debtorCountry = debtorPostal?.countryCode || 'CH';

        const data: Record<string, unknown> = {
          currency: store.i18n.currency(),
          creditor: {
            // The CF resolves the iban server-side from the stored bankaccount
            // address (spec 1.19 Phase 3); the client no longer sends it.
            account: '',
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

        const result = await store.qrBillFn({ tenantId, addressOkey: address.okey, data });
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

      /**
       * Open a web/social link. Synchronous on purpose: it must run inside the ActionSheet button's
       * user-gesture handler, otherwise Safari blocks window.open (popup blocker) after the overlay
       * dismisses. Do NOT route this through openUrl/use (those run after onDidDismiss).
       */
      openWeb(address: AddressModel): void {
        const url = getWebUrl(address);
        if (url) openExternalUrl(url);
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
          default: warn('AddressesAccordionStore.use: unsupported address channel ' + address.addressChannel + ' for address ' + address.parentKey + '/' + address.okey);
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
            center: { lat: coordinates.lat, lng: coordinates.lng, title: addressStr }
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
