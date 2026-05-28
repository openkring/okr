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
import { PFX } from './scope';

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
  currency:                        PFX + 'currency',
  qrinvoice:                       PFX + 'qrinvoice',
  description:                     PFX + 'description',
  create_label:                    PFX + 'create.label',
  create_description:              PFX + 'create.description',
  create_conf:                     PFX + 'create.conf',
  create_error:                    PFX + 'create.error',
  update_label:                    PFX + 'update.label',
  update_description:              PFX + 'update.description',
  update_conf:                     PFX + 'update.conf',
  update_error:                    PFX + 'update.error',
  delete_label:                    PFX + 'delete.label',
  delete_description:              PFX + 'delete.description',
  delete_conf:                     PFX + 'delete.conf',
  delete_error:                    PFX + 'delete.error',
  delete_confirm:                  PFX + 'delete.confirm',
  copy_label:                      PFX + 'copy.label',
  copy_description:                PFX + 'copy.description',
  copy_conf:                       PFX + 'copy.conf',
  copy_error:                      PFX + 'copy.error',
  copy_email:                      PFX + 'copy.email',
  view_label:                      PFX + 'view.label',
  view_description:                PFX + 'view.description',
  locate_label:                    PFX + 'locate.label',
  locate_description:              PFX + 'locate.description',
  call_label:                      PFX + 'call.label',
  call_description:                PFX + 'call.description',
  favorite_enable_label:           PFX + 'favorite.enable.label',
  favorite_enable_description:     PFX + 'favorite.enable.description',
  favorite_enable_conf:            PFX + 'favorite.enable.conf',
  favorite_disable_label:          PFX + 'favorite.disable.label',
  favorite_disable_description:    PFX + 'favorite.disable.description',
  favorite_disable_conf:           PFX + 'favorite.disable.conf',
  send_mail_label:                 PFX + 'send.mail.label',
  send_mail_description:           PFX + 'send.mail.description',
  send_sms_label:                  PFX + 'send.sms.label',
  send_sms_description:            PFX + 'send.sms.description',
  send_email_label:                PFX + 'send.email.label',
  send_email_description:          PFX + 'send.email.description',
  send_email_subjectPlaceholder:   PFX + 'send.email.subjectPlaceholder',
  send_email_bodyPlaceholder:      PFX + 'send.email.bodyPlaceholder',
  browse_label:                    PFX + 'browse.label',
  browse_description:              PFX + 'browse.description',
  search_label:                    PFX + 'search.label',
  share_label:                     PFX + 'share.label',
  share_description:               PFX + 'share.description',

  usage_name:                      PFX + 'usage.name',
  usage_label:                     PFX + 'usage.label',
  usage_home_label:                PFX + 'usage.home.label',
  usage_home_description:          PFX + 'usage.home.description',
  usage_work_label:                PFX + 'usage.work.label',
  usage_work_description:          PFX + 'usage.work.description',
  usage_mobile_label:              PFX + 'usage.mobile.label',
  usage_mobile_description:        PFX + 'usage.mobile.description',
  usage_custom_label:              PFX + 'usage.custom.label',
  usage_custom_placeholder:        PFX + 'usage.custom.placeholder',
  usage_custom_description:        PFX + 'usage.custom.description',

  channel_label:                   PFX + 'channel.label',
  channel_all_label:               PFX + 'channel.all.label',
  channel_phone_label:             PFX + 'channel.phone.label',
  channel_phone_placeholder:       PFX + 'channel.phone.placeholder',
  channel_phone_description:       PFX + 'channel.phone.description',
  channel_email_label:             PFX + 'channel.email.label',
  channel_email_placeholder:       PFX + 'channel.email.placeholder',
  channel_email_description:       PFX + 'channel.email.description',
  channel_postal_label:            PFX + 'channel.postal.label',
  channel_postal_description:      PFX + 'channel.postal.description',
  channel_postal_street:           PFX + 'channel.postal.street',
  channel_postal_streetnr:         PFX + 'channel.postal.streetnr',
  channel_postal_placeholder:      PFX + 'channel.postal.placeholder',
  channel_postal_zip:              PFX + 'channel.postal.zip',
  channel_postal_city:             PFX + 'channel.postal.city',
  channel_postal_country:          PFX + 'channel.postal.country',
  address2_label:                  PFX + 'channel.address2.label',
  address2_placeholder:            PFX + 'channel.address2.placeholder',
  web_label:                       PFX + 'channel.web.label',
  web_placeholder:                 PFX + 'channel.web.placeholder',
  web_description:                 PFX + 'channel.web.description',
  twitter_label:                   PFX + 'channel.twitter.label',
  twitter_placeholder:             PFX + 'channel.twitter.placeholder',
  twitter_description:             PFX + 'channel.twitter.description',
  linkedin_label:                  PFX + 'channel.linkedin.label',
  linkedin_placeholder:            PFX + 'channel.linkedin.placeholder',
  linkedin_description:            PFX + 'channel.linkedin.description',
  facebook_label:                  PFX + 'channel.facebook.label',
  facebook_placeholder:            PFX + 'channel.facebook.placeholder',
  facebook_description:            PFX + 'channel.facebook.description',
  matrix_label:                    PFX + 'channel.matrix.label',
  matrix_placeholder:              PFX + 'channel.matrix.placeholder',
  matrix_description:              PFX + 'channel.matrix.description',
  xing_label:                      PFX + 'channel.xing.label',
  xing_placeholder:                PFX + 'channel.xing.placeholder',
  xing_description:                PFX + 'channel.xing.description',
  skype_label:                     PFX + 'channel.skype.label',
  skype_placeholder:               PFX + 'channel.skype.placeholder',
  skype_description:               PFX + 'channel.skype.description',
  custom_label:                    PFX + 'channel.custom.label',
  custom_placeholder:              PFX + 'channel.custom.placeholder',
  custom_description:              PFX + 'channel.custom.description',
  custom_value:                    PFX + 'channel.custom.label',
  customValue_label:               PFX + 'channel.customValue.label',
  customValue_placeholder:         PFX + 'channel.customValue.placeholder',
  instagram_label:                 PFX + 'channel.instagram.label',
  instagram_placeholder:           PFX + 'channel.instagram.placeholder',
  instagram_description:           PFX + 'channel.instagram.description',
  signal_label:                    PFX + 'channel.signal.label',
  signal_placeholder:              PFX + 'channel.signal.placeholder',
  signal_description:              PFX + 'channel.signal.description',
  wire_label:                      PFX + 'channel.wire.label',
  wire_placeholder:                PFX + 'channel.wire.placeholder',
  wire_description:                PFX + 'channel.wire.description',
  github_label:                    PFX + 'channel.github.label',
  github_placeholder:              PFX + 'channel.github.placeholder',
  github_description:              PFX + 'channel.github.description',
  threema_label:                   PFX + 'channel.threema.label',
  threema_placeholder:             PFX + 'channel.threema.placeholder',
  threema_description:             PFX + 'channel.threema.description',
  telegram_label:                  PFX + 'channel.telegram.label',
  telegram_placeholder:            PFX + 'channel.telegram.placeholder',
  telegram_description:            PFX + 'channel.telegram.description',
  whatsapp_label:                  PFX + 'channel.whatsapp.label',
  whatsapp_placeholder:            PFX + 'channel.whatsapp.placeholder',
  whatsapp_description:            PFX + 'channel.whatsapp.description',
  bankaccount_label:               PFX + 'channel.bankaccount.label',
  bankaccount_placeholder:         PFX + 'channel.bankaccount.placeholder',
  bankaccount_description:         PFX + 'channel.bankaccount.description',
  bankaccount_description_placeholder: PFX + 'channel.bankaccount.label',
  twint_label:                     PFX + 'channel.twint.label',
  twint_placeholder:               PFX + 'channel.twint.placeholder',
  twint_description:               PFX + 'channel.twint.description',

  as_title:                        PFX + 'actionsheet.title',
  as_view:                         PFX + 'actionsheet.view',
  as_edit:                         PFX + 'actionsheet.edit',
  as_copy:                         PFX + 'actionsheet.copy',
  as_delete:                       PFX + 'actionsheet.delete',
  as_email_send:                   PFX + 'actionsheet.email.send',
  as_email_copy:                   PFX + 'actionsheet.email.copy',
  as_file_upload:                  PFX + 'actionsheet.file.upload',
  as_file_view:                    PFX + 'actionsheet.file.view',
  as_phone_call:                   PFX + 'actionsheet.phone.call',
  as_phone_copy:                   PFX + 'actionsheet.phone.copy',
  as_phone_sms:                    PFX + 'actionsheet.phone.sms',
  as_chat_start:                   PFX + 'actionsheet.chat.start',
  as_postal_view:                  PFX + 'actionsheet.postal.view',
  as_iban_view:                    PFX + 'actionsheet.iban.view',
  as_iban_genqr:                   PFX + 'actionsheet.iban.generate',
  as_web_open:                     PFX + 'actionsheet.web.open',
  as_web_copy:                     PFX + 'actionsheet.web.copy',
  as_subject_edit:                 PFX + 'actionsheet.subject.edit',
  as_hide:                         PFX + 'actionsheet.hide',
  cancel:                          '@cancel',
  ok:                              '@ok',
  save:                            '@save.label',

  bkey_label:                      PFX + 'bkey.label',
  bkey_placeholder:                PFX + 'bkey.placeholder',
  bkey_helper:                     PFX + 'bkey.helper',
  addressChannelLabel_label:       PFX + 'addressChannelLabel.label',
  addressChannelLabel_placeholder: PFX + 'addressChannelLabel.placeholder',
  addressChannelLabel_helper:      PFX + 'addressChannelLabel.helper',
  addressUsageLabel_label:         PFX + 'addressUsageLabel.label',
  addressUsageLabel_placeholder:   PFX + 'addressUsageLabel.placeholder',
  addressUsageLabel_helper:        PFX + 'addressUsageLabel.helper',
  streetName_label:                PFX + 'streetName.label',
  streetName_placeholder:          PFX + 'streetName.placeholder',
  streetName_helper:               PFX + 'streetName.helper',
  streetNumber_label:              PFX + 'streetNumber.label',
  streetNumber_placeholder:        PFX + 'streetNumber.placeholder',
  streetNumber_helper:             PFX + 'streetNumber.helper',
  addressValue2_label:             PFX + 'addressValue2.label',
  addressValue2_placeholder:       PFX + 'addressValue2.placeholder',
  addressValue2_helper:            PFX + 'addressValue2.helper',
  countryCode_label:               PFX + 'countryCode.label',
  countryCode_placeholder:         PFX + 'countryCode.placeholder',
  countryCode_helper:              PFX + 'countryCode.helper',
  zipCode_label:                   PFX + 'zipCode.label',
  zipCode_placeholder:             PFX + 'zipCode.placeholder',
  zipCode_helper:                  PFX + 'zipCode.helper',
  city_label:                      PFX + 'city.label',
  city_placeholder:                PFX + 'city.placeholder',
  city_helper:                     PFX + 'city.helper',
  url_label:                       PFX + 'url.label',
  url_placeholder:                 PFX + 'url.placeholder',
  url_helper:                      PFX + 'url.helper',
  iban_label:                      PFX + 'iban.label',
  iban_placeholder:                PFX + 'iban.placeholder',
  iban_helper:                     PFX + 'iban.helper',
  notes_label:                     PFX + 'notes.label',
  notes_placeholder:               PFX + 'notes.placeholder',
  email_label:                     PFX + 'email.label',
  email_placeholder:               PFX + 'email.placeholder',
  phone_label:                     PFX + 'phone.label',
  phone_placeholder:               PFX + 'phone.placeholder',
  isFavorite_label:                PFX + 'isFavorite.label',
  isFavorite_helper:               PFX + 'isFavorite.helper',
  isCc_label:                      PFX + 'isCc.label',
  isCc_helper:                     PFX + 'isCc.helper',    
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
