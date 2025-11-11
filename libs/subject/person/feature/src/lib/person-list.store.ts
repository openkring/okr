import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressModel, MembershipCollection, MembershipModel, PersonModel } from '@bk2/shared-models';
import { AppNavigationService, confirm, copyToClipboardWithConfirmation, navigateByUrl } from '@bk2/shared-util-angular';
import { chipMatches, debugListLoaded, hasRole, nameMatches } from '@bk2/shared-util-core';

import { CategoryService } from '@bk2/category-data-access';
import { AddressService } from '@bk2/subject-address-data-access';
import { PersonService } from '@bk2/subject-person-data-access';
import { convertFormToNewPerson, convertNewPersonFormToEmailAddress, convertNewPersonFormToMembership, convertNewPersonFormToPhoneAddress, convertNewPersonFormToPostalAddress, convertNewPersonFormToWebAddress, PersonNewFormModel } from '@bk2/subject-person-util';

import { PersonNewModalComponent } from './person-new.modal';

export type PersonListState = {
  orgId: string;
  searchTerm: string;
  selectedTag: string;
  selectedGender: string;
};

export const initialState: PersonListState = {
  orgId: '',
  searchTerm: '',
  selectedTag: '',
  selectedGender: 'all',
};

export const PersonListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    addressService: inject(AddressService),
    categoryService: inject(CategoryService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController) 
  })),
  withProps((store) => ({
    personsResource: rxResource({
      stream: () => {
        const persons$ = store.personService.list();
        debugListLoaded('PersonListStore.persons$', persons$, store.appStore.currentUser());   
        return persons$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      persons: computed(() => state.personsResource.value()),
      deceased: computed(() => state.personsResource.value()?.filter((person: PersonModel) => person.dateOfDeath !== undefined && person.dateOfDeath.length > 0) ?? []),
      showGender: computed(() => hasRole(state.appStore.privacySettings().showGender, state.appStore.currentUser())),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      membershipCategoryKey: computed(() => 'mcat_' + state.orgId()),
    };
  }),

  withProps((store) => ({
    mcatResource: rxResource({
      params: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      stream: ({params}) => {
        if (!params.mcatId || params.mcatId.length === 0) return of(undefined);
        return store.categoryService.read(params.mcatId);
      }
    }),
  })),
  withComputed((state) => {
    return {
      // all persons
      personsCount: computed(() => state.personsResource.value()?.length ?? 0), 
      filteredPersons: computed(() => 
        state.personsResource.value()?.filter((person: PersonModel) => 
          nameMatches(person.index, state.searchTerm()) &&
          nameMatches(person.gender, state.selectedGender(), true) &&
          chipMatches(person.tags, state.selectedTag())) ?? []
      ),
      
      // deceased persons
      deceasedCount: computed(() => state.deceased().length ?? 0), 
      filteredDeceased: computed(() => 
        state.deceased()?.filter((person: PersonModel) => 
          nameMatches(person.index, state.searchTerm()) &&
          nameMatches(person.gender, state.selectedGender(), true) &&
          chipMatches(person.tags, state.selectedTag())) ?? []
      ),
      membershipCategory: computed(() => state.mcatResource.value() ?? undefined),
      isLoading: computed(() => state.personsResource.isLoading() || state.mcatResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.personsResource.reload();
      },

      reload() {
        store.personsResource.reload();
      },
      
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedGender(selectedGender: string) {
        patchState(store, { selectedGender });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('person');
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        const _modal = await store.modalController.create({
          component: PersonNewModalComponent
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') {
          const _vm = data as PersonNewFormModel;

          if (store.personService.checkIfExists(store.persons(), _vm.firstName, _vm.lastName)) {
            if (!confirm(store.alertController, '@subject.person.operation.create.exists.error', true)) return;           
          }

          const _personKey = await store.personService.create(convertFormToNewPerson(_vm, store.tenantId()), store.currentUser());
          const _avatarKey = `person.${_personKey}`;
          if ((_vm.email ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToEmailAddress(_vm, store.tenantId()), _avatarKey);
          }
          if ((_vm.phone ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToPhoneAddress(_vm, store.tenantId()), _avatarKey);
          }
          if ((_vm.web ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToWebAddress(_vm, store.tenantId()), _avatarKey);
          }
          if ((_vm.city ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToPostalAddress(_vm, store.tenantId()), _avatarKey);
          }
          if (_vm.shouldAddMembership) {
            if ((_vm.orgKey ?? '').length > 0 && (_vm.membershipCategory ?? '').length > 0) {
              await this.saveMembership(_vm, _personKey);
            }
          }
        }
        store.personsResource.reload();
      },

      /**
       * Optionally add a membership to a person.
       * We do not want to use MembershipService.create() in order to avoid the dependency to the membership module
       * @param vm  the form data for a new person
       * @param personKey the key of the newly created person
       */
      async saveMembership(vm: PersonNewFormModel, personKey?: string): Promise<string | undefined> {
        if (!personKey || personKey.length === 0) {
          console.warn('PersonListStore.saveMembership: personKey is empty, cannot save membership');
          return undefined;
        }
        const _membership = convertNewPersonFormToMembership(vm, personKey, store.tenantId());
        _membership.index = 'mn:' + _membership.memberName1 + ' ' + _membership.memberName2 + ' mk:' + _membership.memberKey + ' ok:' + _membership.orgKey;
        return await store.firestoreService.createModel<MembershipModel>(MembershipCollection, _membership, '@membership.operation.create', store.appStore.currentUser());
      },

      saveAddress(address: AddressModel, avatarKey: string): void {
        address.parentKey = avatarKey;
        store.addressService.create(address, store.currentUser());
      },

      async export(type: string): Promise<void> {
        console.log(`PersonListStore.export(${type}) ist not yet implemented`);
      },

      async edit(person: PersonModel): Promise<void> {
        store.appNavigationService.pushLink('/person/all' );
        await navigateByUrl(store.router, `/person/${person.bkey}`);
        store.personsResource.reload();
      },

      async delete(person: PersonModel): Promise<void> {
        await store.personService.delete(person, store.currentUser());
        this.reset();
      },

      async copyEmailAddresses(): Promise<void> {
        const _allEmails = store.filteredPersons().map(_person => _person.favEmail);
        const _emails = _allEmails.filter(e => e); // this filters all empty emails, because '' is a falsy value
        await copyToClipboardWithConfirmation(store.toastController, _emails.toString() ?? '', '@subject.address.operation.emailCopy.conf');
      }
    }
  }),

  withHooks({
    onInit(store) {
      patchState(store, { orgId: store.tenantId() });
    }
  })
);
