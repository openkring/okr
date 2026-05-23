import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressModel, CategoryListModel, OrgCollection, OrgModel } from '@bk2/shared-models';
import { AlertService, AppNavigationService, copyToClipboardWithConfirmation } from '@bk2/shared-util-angular';
import { chipMatches, debugItemLoaded, debugListLoaded, getSystemQuery, isOrg, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { AddressService } from '@bk2/subject-address-data-access';
import { OrgService } from '@bk2/subject-org-data-access';
import { convertFormToNewOrg, convertNewOrgFormToEmailAddress, convertNewOrgFormToPhoneAddress, convertNewOrgFormToPostalAddress, convertNewOrgFormToWebAddress, OrgNewFormModel } from '@bk2/subject-org-util';

import { OrgNewModal } from './org-new.modal';
import { OrgEditModal } from './org-edit.modal';
import { PFX } from './scope';

export type OrgState = {
  orgKey: string;

  // filter
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
};
export const initialState: OrgState = {
  orgKey: '',

  // filter
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
};

const ORG_I18N_KEYS = {
  orgs:                            PFX + 'orgs',
  empty:                           PFX + 'empty',
  name:                            '@name',
  phone:                           '@phone',
  email:                           '@email',
  create_label:                    PFX + 'create.label',
  edit_label:                      PFX + 'edit.label',
  view_label:                      PFX + 'view.label',
  delete_confirm:                  PFX + 'delete.confirm',
  as_title:                        PFX + 'actionsheet.title',
  as_edit:                         PFX + 'actionsheet.edit',
  as_delete:                       PFX + 'actionsheet.delete',
  cancel:                          '@cancel',
  changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',

  // org.form.ts (OrgFormI18n)
  bkey_label:                      '@subject/org/ui.bkey.label',
  bkey_placeholder:                '@subject/org/ui.bkey.placeholder',
  bkey_helper:                     '@subject/org/ui.bkey.helper',
  name_label:                      '@subject/org/ui.name.label',
  name_placeholder:                '@subject/org/ui.name.placeholder',
  name_helper:                     '@subject/org/ui.name.helper',
  taxId_label:                     '@subject/org/ui.taxId.label',
  taxId_placeholder:               '@subject/org/ui.taxId.placeholder',
  taxId_helper:                    '@subject/org/ui.taxId.helper',
  bexioId_label:                   '@subject/org/ui.bexioId.label',
  bexioId_placeholder:             '@subject/org/ui.bexioId.placeholder',
  bexioId_helper:                  '@subject/org/ui.bexioId.helper',
  notes_label:                     '@subject/org/ui.notes.label',
  notes_placeholder:               '@subject/org/ui.notes.placeholder',
  dateOfFoundation_label:          '@subject/org/ui.dateOfFoundation.label',
  dateOfFoundation_placeholder:    '@subject/org/ui.dateOfFoundation.placeholder',
  dateOfFoundation_helper:         '@subject/org/ui.dateOfFoundation.helper',
  dateOfLiquidation_label:         '@subject/org/ui.dateOfLiquidation.label',
  dateOfLiquidation_placeholder:   '@subject/org/ui.dateOfLiquidation.placeholder',
  dateOfLiquidation_helper:        '@subject/org/ui.dateOfLiquidation.helper',

  // org-new.form.ts additional keys (OrgNewFormI18n)
  streetName_label:                '@subject/org/ui.streetName.label',
  streetName_placeholder:          '@subject/org/ui.streetName.placeholder',
  streetName_helper:               '@subject/org/ui.streetName.helper',
  streetNumber_label:              '@subject/org/ui.streetNumber.label',
  streetNumber_placeholder:        '@subject/org/ui.streetNumber.placeholder',
  streetNumber_helper:             '@subject/org/ui.streetNumber.helper',
  countryCode_label:               '@subject/org/ui.countryCode.label',
  countryCode_placeholder:         '@subject/org/ui.countryCode.placeholder',
  countryCode_helper:              '@subject/org/ui.countryCode.helper',
  zipCode_label:                   '@subject/org/ui.zipCode.label',
  zipCode_placeholder:             '@subject/org/ui.zipCode.placeholder',
  zipCode_helper:                  '@subject/org/ui.zipCode.helper',
  city_label:                      '@subject/org/ui.city.label',
  city_placeholder:                '@subject/org/ui.city.placeholder',
  city_helper:                     '@subject/org/ui.city.helper',
  url_label:                       '@subject/org/ui.url.label',
  url_placeholder:                 '@subject/org/ui.url.placeholder',
  url_helper:                      '@subject/org/ui.url.helper',
  email_label:                     '@subject/org/ui.email.label',
  email_placeholder:               '@subject/org/ui.email.placeholder',
  phone_label:                     '@subject/org/ui.phone.label',
  phone_placeholder:               '@subject/org/ui.phone.placeholder',
} satisfies Record<string, string>;

export type OrgI18n = { [K in keyof typeof ORG_I18N_KEYS]: Signal<string> };

export const OrgStore = signalStore(
  withState(initialState),
  withProps(() => ({
    orgService: inject(OrgService),
    addressService: inject(AddressService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    toastController: inject(ToastController),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(ORG_I18N_KEYS),

    orgsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc').pipe(
        debugListLoaded<OrgModel>('OrgStore.orgs', store.appStore.currentUser())
        )
      }
    }),
    orgResource: rxResource({
      params: () => ({
        orgKey: store.orgKey()
      }),
      stream: ({params}) => {
        return store.orgService.read(params.orgKey).pipe(
          debugItemLoaded('OrgStore.org', store.appStore.currentUser())
        );
      }
    }),
  })),

  withComputed((state) => ({
    // orgs
    orgs: computed(() => {
      return state.orgsResource.value();
    }),
    orgsCount: computed(() => state.orgsResource.value()?.length ?? 0),
    filteredOrgs: computed(() =>
      state.orgsResource.value()?.filter((org: OrgModel) =>
        nameMatches(org.index, state.searchTerm()) &&
        nameMatches(org.type, state.selectedType()) &&
        chipMatches(org.tags, state.selectedTag())
      ) ?? []
    ),

    // org
    org: computed(() => state.orgResource.value()),
    defaultResource : computed(() => state.appStore.defaultResource()),

    // other
    isLoading: computed(() => state.orgsResource.isLoading() || state.orgResource.isLoading()),
    privacySettings: computed(() => state.appStore.privacySettings()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
    tags: computed(() => state.appStore.getTags('org')),
    types: computed(() => state.appStore.getCategory('org_type')),
  })),
  withMethods((store) => ({
    reset() {
      patchState(store, initialState);
    },
    reload() {
      store.orgsResource.reload();
      store.orgResource.reload();
    },
    printState() {
      console.log('------------------------------------');
      console.log('OrgStore state:');
      console.log('  searchTerm: ' + store.searchTerm());
      console.log('  selectedTag: ' + store.selectedTag());
      console.log('  selectedOrgType: ' + store.selectedType());
      console.log('  orgs: ' + JSON.stringify(store.orgs()));
      console.log('  orgsCount: ' + store.orgsCount());
      console.log('  filteredOrgs: ' + JSON.stringify(store.filteredOrgs()));
      console.log('  currentUser: ' + JSON.stringify(store.currentUser()));
      console.log('  tenantId: ' + store.tenantId());
      console.log('------------------------------------');
    },

    /******************************** setters (filter) ******************************************* */
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
    setSelectedType(selectedType: string) {
      patchState(store, { selectedType });
    },
    setSelectedTag(selectedTag: string) {
      patchState(store, { selectedTag });
    },
    setOrgKey(orgKey: string): void {
      patchState(store, { orgKey });
    },

    /******************************** actions ******************************************* */
    async export(type: string): Promise<void> {
      console.log(`OrgStore.export(${type}) is not yet implemented.`);
    },

    async add(readOnly = true): Promise<void> {
      if (readOnly) return;
      const modal = await store.modalController.create({
        component: OrgNewModal,
        componentProps: {
          currentUser: store.currentUser(),
          tags: store.tags(),
          types: store.types(),
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        const org = data as OrgNewFormModel;
        const key = `org.${await store.orgService.create(convertFormToNewOrg(org, store.tenantId()), store.currentUser())}`;
        if ((org.email ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToEmailAddress(org, store.tenantId()), key);
        }
        if ((org.phone ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToPhoneAddress(org, store.tenantId()), key);
        }
        if ((org.url ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToWebAddress(org, store.tenantId()), key);
        }
        if ((org.city ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToPostalAddress(org, store.tenantId()), key);
        }
      }
      store.orgsResource.reload();
    },

    saveAddress(address: AddressModel, orgKey: string): void {
      address.parentKey = orgKey;
      store.addressService.create(address, store.currentUser());
    },

    async edit(org: OrgModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: OrgEditModal,
        componentProps: {
          org,
          currentUser: store.currentUser(),
          resource: store.defaultResource(),
          tags: store.tags(),
          tenantId: store.tenantId(),
          types: store.types(),
          readOnly
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        if (isOrg(data, store.tenantId())) {
          data.bkey?.length === 0 ? 
            await store.orgService.create(data, store.currentUser()) : 
            await store.orgService.update(data, store.currentUser());
          this.reload();
        }
      }
    },

    async delete(org?: OrgModel, readOnly = true): Promise<void> {
      if (!org || readOnly) return;
      const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (result === true) {
        await store.orgService.delete(org, store.currentUser());
        this.reload();
      }
    },

    async copyEmailAddresses(): Promise<void> {
      const allEmails = store.filteredOrgs().map((org) => org.favEmail);
      const emails = allEmails.filter((e) => e);
      await copyToClipboardWithConfirmation(
        store.toastController,
        emails.toString() ?? '',
        '@subject.address.operation.emailCopy.conf'
      );
    },
  }))
);
