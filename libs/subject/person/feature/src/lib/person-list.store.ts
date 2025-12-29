import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressModel, DefaultLanguage, MembershipCollection, MembershipModel, PersonModel, PersonModelName } from '@bk2/shared-models';
import { confirm, copyToClipboardWithConfirmation, navigateByUrl } from '@bk2/shared-util-angular';
import { chipMatches, debugListLoaded, getCountryName, hasRole, nameMatches } from '@bk2/shared-util-core';

import { AddressService, GeocodingService } from '@bk2/subject-address-data-access';
import { PersonService } from '@bk2/subject-person-data-access';
import { convertFormToNewPerson, convertNewPersonFormToEmailAddress, convertNewPersonFormToMembership, convertNewPersonFormToPhoneAddress, convertNewPersonFormToPostalAddress, convertNewPersonFormToWebAddress, PersonNewFormModel } from '@bk2/subject-person-util';

import { PersonNewModalComponent } from './person-new.modal';
import { browseUrl } from '@bk2/subject-address-util';
import { Languages } from '@bk2/shared-categories';
import { MapViewModalComponent } from '@bk2/shared-ui';

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
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    geocodeService: inject(GeocodingService),
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
        return of(store.appStore.getCategory(params.mcatId));
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
        return store.appStore.getTags(PersonModelName);
      },

      /******************************* actions *************************************** */
      async add(readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: PersonNewModalComponent,
          componentProps: {
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm') {
          const vm = data as PersonNewFormModel;

          if (store.personService.checkIfExists(store.persons(), vm.firstName, vm.lastName)) {
            if (!confirm(store.alertController, '@subject.person.operation.create.exists.error', true)) return;           
          }

          const personKey = await store.personService.create(convertFormToNewPerson(vm, store.tenantId()), store.currentUser());
          const avatarKey = `person.${personKey}`;
          if ((vm.email ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToEmailAddress(vm, store.tenantId()), avatarKey);
          }
          if ((vm.phone ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToPhoneAddress(vm, store.tenantId()), avatarKey);
          }
          if ((vm.web ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToWebAddress(vm, store.tenantId()), avatarKey);
          }
          if ((vm.city ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToPostalAddress(vm, store.tenantId()), avatarKey);
          }
          if (vm.shouldAddMembership) {
            if ((vm.orgKey ?? '').length > 0 && (vm.membershipCategory ?? '').length > 0) {
              await this.saveMembership(vm, personKey);
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
        const membership = convertNewPersonFormToMembership(vm, personKey, store.tenantId());
        membership.index = 'mn:' + membership.memberName1 + ' ' + membership.memberName2 + ' mk:' + membership.memberKey + ' ok:' + membership.orgKey;
        return await store.firestoreService.createModel<MembershipModel>(MembershipCollection, membership, '@membership.operation.create', store.appStore.currentUser());
      },

      saveAddress(address: AddressModel, avatarKey: string): void {
        address.parentKey = avatarKey;
        store.addressService.create(address, store.currentUser());
      },

      async export(type: string): Promise<void> {
        console.log(`PersonListStore.export(${type}) ist not yet implemented`);
      },

      async edit(person?: PersonModel, readOnly = true): Promise<void> {
        if (!person) return; // we pass readonly to the edit form
        store.appStore.appNavigationService.pushLink('/person/all' );
        await navigateByUrl(store.router, `/person/${person.bkey}`, { readOnly });
        store.personsResource.reload();
      },

      async delete(person?: PersonModel, readOnly = true): Promise<void> {
        if (!person || readOnly) return;
        const result = await confirm(store.alertController, '@subject.person.operation.delete.confirm', true);
        if (result === true) {
          await store.personService.delete(person, store.currentUser());
          this.reset();
        }
      },

      async copyEmailAddresses(): Promise<void> {
        const allEmails = store.filteredPersons().map(person => person.favEmail);
        const emails = allEmails.filter(e => e); // this filters all empty emails, because '' is a falsy value
        await copyToClipboardWithConfirmation(store.toastController, emails.toString() ?? '', '@subject.address.operation.emailCopy.conf');
      },

      async copy(value: string, label: string): Promise<void> {
        await copyToClipboardWithConfirmation(store.toastController, value ?? '', label);
      },

      async sendEmail(email: string): Promise<void> {
        return await browseUrl(`mailto:${email}`, '');
      },
      
      async call(phone: string): Promise<void> {
        return await browseUrl(`tel:${phone}`, '');
      },
      
      async showOnMap(person?: PersonModel): Promise<void> {
        if (!person) return;
        const countryName = getCountryName(person.favCountryCode, Languages[DefaultLanguage].abbreviation);
        const addressStr = !countryName ? 
          `${person.favStreetName} ${person.favStreetNumber}, ${person.favZipCode} ${person.favCity}` : 
          `${person.favStreetName} ${person.favStreetNumber}, ${person.favZipCode} ${person.favCity}, ${countryName}`;

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
      }
    }
  }),

  withHooks({
    onInit(store) {
      patchState(store, { orgId: store.tenantId() });
    }
  })
);
