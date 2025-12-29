import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressModel, CategoryListModel, OrgCollection, OrgModel } from '@bk2/shared-models';
import { AppNavigationService, copyToClipboardWithConfirmation } from '@bk2/shared-util-angular';
import { chipMatches, debugItemLoaded, getSystemQuery, isOrg, nameMatches } from '@bk2/shared-util-core';

import { AddressService } from '@bk2/subject-address-data-access';
import { OrgService } from '@bk2/subject-org-data-access';
import { convertFormToNewOrg, convertNewOrgFormToEmailAddress, convertNewOrgFormToPhoneAddress, convertNewOrgFormToPostalAddress, convertNewOrgFormToWebAddress, OrgNewFormModel } from '@bk2/subject-org-util';

import { OrgNewModalComponent } from './org-new.modal';
import { OrgEditModalComponent } from './org-edit.modal';
import { of } from 'rxjs';

export type OrgState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  orgKey: string;
};
export const initialState: OrgState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  orgKey: '',
};

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
    alertController: inject(AlertController),
    toastController: inject(ToastController),
  })),
  withProps((store) => ({
    orgsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc')
      }
    }),
    orgResource: rxResource({
      params: () => ({
        orgKey: store.orgKey()
      }),
      stream: ({params}) => {
        if (!params.orgKey) return of(undefined);
        const org$ = store.orgService.read(params.orgKey);
        debugItemLoaded('OrgStore.org', org$, store.appStore.currentUser());
        return org$;
      }
    }),
  })),
  withComputed((state) => ({
    // orgs
    orgs: computed(() => {
      const value = state.orgsResource.value();
      console.log('Computed orgs:', value?.length);
      return value;
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
    isLoading: computed(() => state.orgsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
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

    /******************************** getters ******************************************* */
    getTags(): string {
      return store.appStore.getTags('org');
    },

    getTypes(): CategoryListModel {
      return store.appStore.getCategory('org_type');
    },

    /******************************** actions ******************************************* */
    async export(type: string): Promise<void> {
      console.log(`OrgStore.export(${type}) is not yet implemented.`);
    },

    async add(readOnly = true): Promise<void> {
      if (readOnly) return;
      const modal = await store.modalController.create({
        component: OrgNewModalComponent,
        componentProps: {
          currentUser: store.currentUser(),
          tags: this.getTags(),
          types: this.getTypes(),
          readOnly,
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        const vm = data as OrgNewFormModel;
        const key = `org.${await store.orgService.create(convertFormToNewOrg(vm, store.tenantId()), store.currentUser())}`;
        if ((vm.email ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToEmailAddress(vm, store.tenantId()), key);
        }
        if ((vm.phone ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToPhoneAddress(vm, store.tenantId()), key);
        }
        if ((vm.url ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToWebAddress(vm, store.tenantId()), key);
        }
        if ((vm.city ?? '').length > 0) {
          this.saveAddress(convertNewOrgFormToPostalAddress(vm, store.tenantId()), key);
        }
      }
      store.orgsResource.reload();
    },

    saveAddress(address: AddressModel, orgKey: string): void {
      address.parentKey = orgKey;
      store.addressService.create(address, store.currentUser());
    },

    async edit(org?: OrgModel, readOnly = true): Promise<void> {
      if (!org) return;
      const modal = await store.modalController.create({
        component: OrgEditModalComponent,
        componentProps: {
          org,
          currentUser: store.currentUser(),
          tags: this.getTags(),
          readOnly
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        if (isOrg(data, store.appStore.tenantId())) {
          await (!data.bkey ? 
            store.orgService.create(data, store.currentUser()) : 
            store.orgService.update(data, store.currentUser()));
          this.reload();
        }
      }

    },

    async delete(org?: OrgModel, readOnly = true): Promise<void> {
      if (!org) return;
      await store.orgService.delete(org, store.currentUser());
      this.reset();
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
