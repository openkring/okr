import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Photo } from '@capacitor/camera';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressModel, CategoryListModel, DefaultLanguage, MembershipCollection, MembershipModel, OrgModel, PersonModel, PersonModelName, ResourceModel } from '@bk2/shared-models';
import { confirm, copyToClipboardWithConfirmation, navigateByUrl } from '@bk2/shared-util-angular';
import { chipMatches, debugItemLoaded, getCountryName, hasRole, isPerson, nameMatches } from '@bk2/shared-util-core';
import { MapViewModalComponent } from '@bk2/shared-ui';
import { Languages } from '@bk2/shared-categories';

import { AddressService, GeocodingService } from '@bk2/subject-address-data-access';
import { PersonService } from '@bk2/subject-person-data-access';
import { convertFormToNewPerson, convertNewPersonFormToEmailAddress, convertNewPersonFormToMembership, convertNewPersonFormToPhoneAddress, convertNewPersonFormToPostalAddress, convertNewPersonFormToWebAddress, PersonNewFormModel } from '@bk2/subject-person-util';
import { browseUrl } from '@bk2/subject-address-util';

import { MatrixChatService } from '@bk2/chat-data-access';
import { UserService } from '@bk2/user-data-access';
import { AvatarService } from '@bk2/avatar-data-access';

import { PersonNewModal } from './person-new.modal';

export type PersonState = {
  orgId: string;
  personKey: string | undefined;

  // filter
  searchTerm: string;
  selectedTag: string;
  selectedGender: string;
};
export const initialState: PersonState = {
  orgId: '',
  personKey: undefined,

  // filter
  searchTerm: '',
  selectedTag: '',
  selectedGender: 'all',
};

export const PersonStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    userService: inject(UserService),
    addressService: inject(AddressService),
    avatarService: inject(AvatarService),
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    geocodeService: inject(GeocodingService),
    matrixService: inject(MatrixChatService),
  })),

  withComputed((state) => {
    return {
      persons: computed(() => state.appStore.allPersons()),
      deceased: computed(() => state.appStore.allPersons().filter((person: PersonModel) => person.dateOfDeath !== undefined && person.dateOfDeath.length > 0) ?? []),
      showGender: computed(() => hasRole(state.appStore.privacySettings().showGender, state.appStore.currentUser())),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      membershipCategoryKey: computed(() => state.appStore.getOrg(state.orgId())?.membershipCategoryKey ?? 'mcat_default'),
      defaultResource : computed(() => state.appStore.defaultResource() ?? new ResourceModel(state.appStore.env.tenantId)),
      defaultMcat: computed(() => state.appStore.getCategory('mcat_default'))
    };
  }),

  withProps((store) => ({
    personUserModelResource: rxResource({
      params: () => ({ personKey: store.personKey() }),
      stream: ({ params }) => store.userService.readByPersonKey(params.personKey ?? '')
    }),

    personResource: rxResource({
      params: () => ({
        personKey: store.personKey()
      }),
      stream: ({params}) => {
        return store.personService.read(params.personKey).pipe(
          debugItemLoaded('PersonStore.person', store.appStore.currentUser())
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      // all persons
      personsCount: computed(() => state.persons().length ?? 0), 
      filteredPersons: computed(() => 
        state.persons().filter((person: PersonModel) => 
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
      membershipCategory: computed<CategoryListModel>(() => state.appStore.getCategory(state.membershipCategoryKey()) ?? state.defaultMcat()),
      isLoading: computed(() => state.personResource.isLoading()),

      // edit person
      person: computed(() => state.personResource.value()),
      privacySettings: computed(() => {
        const users = state.personUserModelResource.value();
        return state.appStore.getPersonPrivacySettings(users?.[0]);
      }),
    }
  }),

  withMethods((store) => {
    return {
        reset() {
            patchState(store, initialState);
        },

        reload() {
            store.personResource.reload();
        },

        printState() {
            console.log('------------------------------------');
            console.log('PersonState state:');
            console.log('  orgId: ' + store.orgId());
            console.log('  personKey: ' + store.personKey());
            console.log('  searchTerm: ' + store.searchTerm());
            console.log('  selectedTag: ' + store.selectedTag());
            console.log('  selectedGender: ' + store.selectedGender());
            console.log('  persons: ' + JSON.stringify(store.persons()));
            console.log('  personsCount: ' + store.personsCount());
            console.log('  filteredPersons: ' + JSON.stringify(store.filteredPersons()));
            console.log('  currentUser: ' + JSON.stringify(store.currentUser()));
            console.log('  tenantId: ' + store.tenantId());
            console.log('------------------------------------');
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

        setPersonKey(personKey: string): void {
            patchState(store, { personKey });
        },

        setOrgId(orgId: string): void {
            patchState(store, { orgId });
        },

        /******************************** getters ******************************************* */
        getTags(): string {
            return store.appStore.getTags(PersonModelName);
        },

        /******************************** actions ******************************************* */
        async add(readOnly = true): Promise<void> {
            if (readOnly) return;
            const modal = await store.modalController.create({
                component: PersonNewModal,
                componentProps: {
                org: store.appStore.defaultOrg()
                }
            });
            modal.present();
            const { data, role } = await modal.onWillDismiss();
            if (role === 'confirm' && data) {
                const person = data as PersonNewFormModel;

                if (store.personService.checkIfExists(store.persons(), person.firstName, person.lastName)) {
                if (!confirm(store.alertController, '@subject.person.operation.create.exists.error', true)) return;           
                }

                const personKey = await store.personService.create(convertFormToNewPerson(person, store.tenantId()), store.currentUser());
                const avatarKey = `person.${personKey}`;
                if ((person.email ?? '').length > 0) {
                this.saveAddress(convertNewPersonFormToEmailAddress(person, store.tenantId()), avatarKey);
                }
                if ((person.phone ?? '').length > 0) {
                this.saveAddress(convertNewPersonFormToPhoneAddress(person, store.tenantId()), avatarKey);
                }
                if ((person.web ?? '').length > 0) {
                this.saveAddress(convertNewPersonFormToWebAddress(person, store.tenantId()), avatarKey);
                }
                if ((person.city ?? '').length > 0) {
                this.saveAddress(convertNewPersonFormToPostalAddress(person, store.tenantId()), avatarKey);
                }
                if (person.shouldAddMembership) {
                if ((person.orgKey ?? '').length > 0 && (person.membershipCategory ?? '').length > 0) {
                    await this.saveMembership(person, personKey);
                }
                }
            }
        },

        /**
         * Optionally add a membership to a person.
         * We do not want to use MembershipService.create() in order to avoid the dependency to the membership module
         * @param vm  the form data for a new person
         * @param personKey the key of the newly created person
         */
        async saveMembership(vm: PersonNewFormModel, personKey?: string): Promise<string | undefined> {
            if (!personKey || personKey.length === 0) {
                console.warn('PersonStore.saveMembership: personKey is empty, cannot save membership');
                return undefined;
            }
            const membership = convertNewPersonFormToMembership(vm, personKey, store.tenantId());
            membership.index = 'mn:' + membership.memberName1 + ' ' + membership.memberName2 + ' mk:' + membership.memberKey + ' ok:' + membership.orgKey;
            return await store.firestoreService.createModel<MembershipModel>(MembershipCollection, membership, '@membership.operation.create', store.appStore.currentUser());
        },

        async save(person: PersonModel): Promise<void> {
            await (!person.bkey ? 
            store.personService.create(person, store.currentUser()) : 
            store.personService.update(person, store.currentUser()));
        },

        saveAddress(address: AddressModel, avatarKey: string): void {
            address.parentKey = avatarKey;
            store.addressService.create(address, store.currentUser());
        },

        async saveAvatar(photo: Photo): Promise<void> {
          const person = store.person();
          if (!person) return;
          await store.avatarService.saveAvatarPhoto(photo, person.bkey, store.appStore.env.tenantId, PersonModelName);
          store.personResource.reload();
        },

        async export(type: string): Promise<void> {
            console.log(`PersonStore.export(${type}) ist not yet implemented`);
        },

        async edit(person: PersonModel, readOnly = true): Promise<void> {
            const { PersonEditModal } = await import('./person-edit.modal');
            const modal = await store.modalController.create({
                component: PersonEditModal,
                componentProps: {
                    person,
                    currentUser: store.currentUser(),
                    tags: this.getTags(),
                    tenantId: store.tenantId(),
                    genders: store.appStore.getCategory('gender'),
                    readOnly
                }
            });
            modal.present();
            const { data, role } = await modal.onDidDismiss();
            if (role === 'confirm' && data && !readOnly) {
                if (isPerson(data, store.tenantId())) {
                data.bkey?.length === 0 ? 
                    await store.personService.create(data, store.currentUser()) : 
                    await store.personService.update(data, store.currentUser());
                this.reload();
                }
            }
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

        /**
         * Creates a direct message room between the current user and the given person.
         * Opens the Chat Page and preselects this room.
         * @param person the person represents the other end of the direct chat.
         * 
         */
        async chat(person: PersonModel): Promise<void> {
            const room = await store.matrixService.createDirectRoom(person.bkey);
            await navigateByUrl(store.router, '/private/chat/c-contentpage', { selectedRoom: room.roomId });
        },

        async isPersonUser(personKey: string): Promise<boolean> {
            return store.firestoreService.isPersonUser(personKey);
        },
        
        async showOnMap(person?: PersonModel): Promise<void> {
            if (!person) return;
            const countryName = getCountryName(person.favCountryCode, Languages[DefaultLanguage].abbreviation ?? 'de');
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
      patchState(store, { orgId: store.appStore.appConfig().ownerOrgId });
    }
  })
);
