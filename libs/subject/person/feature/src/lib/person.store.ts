import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Photo } from '@capacitor/camera';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, CategoryListModel, DefaultLanguage, MembershipCollection, MembershipModel, OrgModel, PersonModel, PersonModelName, ResourceModel } from '@bk2/shared-models';
import { AlertService, copyToClipboardWithConfirmation, getCcEmailAddresses, getMainEmailAddresses, navigateByUrl } from '@bk2/shared-util-angular';
import { chipMatches, debugItemLoaded, getSystemQuery, hasRole, isPerson, nameMatches } from '@bk2/shared-util-core';
import { EmailAddressesModal, MapViewModal } from '@bk2/shared-ui';
import { Languages } from '@bk2/shared-categories';
import { I18nService } from '@bk2/shared-i18n';

import { AddressService, GeocodingService } from '@bk2/subject-address-data-access';
import { PersonService } from '@bk2/subject-person-data-access';
import { convertFormToNewPerson, convertNewPersonFormToEmailAddress, convertNewPersonFormToMembership, convertNewPersonFormToPhoneAddress, convertNewPersonFormToPostalAddress, convertNewPersonFormToWebAddress, PersonNewFormModel } from '@bk2/subject-person-util';
import { browseUrl, stringifyPostalAddress } from '@bk2/subject-address-util';

import { MatrixChatService } from '@bk2/chat-data-access';
import { UserService } from '@bk2/user-data-access';
import { AvatarService } from '@bk2/avatar-data-access';

import { PFX } from './scope';


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
    alertService: inject(AlertService),
    toastController: inject(ToastController),
    geocodeService: inject(GeocodingService),
    matrixService: inject(MatrixChatService),
    i18nService: inject(I18nService),
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

    i18n: store.i18nService.translateAll({
      membership_create_conf:   PFX + 'membership.create.conf',
      membership_create_error:  PFX + 'membership.create.error',
      delete_confirm:           PFX + 'delete.confirm',
      exists:                   PFX + 'membership.create.exists',
      persons:                  PFX + 'persons',
      name:                     '@name',
      phone:                    '@phone',
      email:                    '@email',
      empty:                    PFX + 'empty',
      create_label:             PFX + 'create.label',
      edit_label:               PFX + 'edit.label',
      view_label:               PFX + 'view.label',
      changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
      changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
      changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
    }),

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
            const { PersonNewModal } = await import('./person-new.modal');
            const modal = await store.modalController.create({
                component: PersonNewModal,
                componentProps: {
                    org: store.appStore.defaultOrg()
                }
            });
            modal.present();
            const { data, role } = await modal.onWillDismiss();
            if (role === 'confirm' && data) {
                const p = data as PersonNewFormModel;

                if (store.personService.checkIfExists(store.persons(), p.firstName, p.lastName)) {
                if (!await store.alertService.confirm(store.i18n.exists(), true)) return;           
                }

                const personKey = await store.personService.create(convertFormToNewPerson(p, store.tenantId()), store.currentUser());
                const avatarKey = `person.${personKey}`;
                if ((p.email ?? '').length > 0) {
                this.saveAddress(convertNewPersonFormToEmailAddress(p, store.tenantId()), avatarKey);
                }
                if ((p.phone ?? '').length > 0) {
                this.saveAddress(convertNewPersonFormToPhoneAddress(p, store.tenantId()), avatarKey);
                }
                if ((p.web ?? '').length > 0) {
                this.saveAddress(convertNewPersonFormToWebAddress(p, store.tenantId()), avatarKey);
                }
                if ((p.city ?? '').length > 0) {
                this.saveAddress(convertNewPersonFormToPostalAddress(p, store.tenantId()), avatarKey);
                }
                if (p.shouldAddMembership) {
                if ((p.orgKey ?? '').length > 0 && (p.membershipCategory ?? '').length > 0) {
                    await this.saveMembership(p, personKey);
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
            return await store.firestoreService.createModel<MembershipModel>(MembershipCollection, membership, 
                store.i18n.membership_create_conf(), store.i18n.membership_create_error(), store.appStore.currentUser());
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

        async saveAvatar(photo: Photo, bkey: string): Promise<void> {
          if (!bkey) return;
          await store.avatarService.saveAvatarPhoto(photo, bkey, store.appStore.env.tenantId, PersonModelName);
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
            const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
            if (result === true) {
                await store.personService.delete(person, store.currentUser());
                this.reset();
            }
        },

        async copyEmailAddresses(readOnly = true): Promise<void> {
            const persons = store.filteredPersons();
            const mainEmails = getMainEmailAddresses(persons);

            const ccQuery = getSystemQuery(store.tenantId());
            ccQuery.push({ key: 'addressChannel', operator: '==', value: 'email' });
            ccQuery.push({ key: 'isCc', operator: '==', value: true });
            const allCcAddresses = await firstValueFrom(store.firestoreService.searchData<AddressModel>(AddressCollection, ccQuery, 'none'));
            const ccEmails = getCcEmailAddresses(persons, allCcAddresses);

            const modal = await store.modalController.create({
                component: EmailAddressesModal,
                componentProps: { mainEmails, ccEmails, canChange: !readOnly }
            });
            await modal.present();
            const { data, role } = await modal.onWillDismiss<{ memberKey: string; readOnly: boolean }>();
            if (role === 'navigate' && data?.memberKey) {
                const person = store.appStore.getPerson(data.memberKey);
                if (!person) return;
                const { PersonEditModal } = await import('./person-edit.modal');
                const personModal = await store.modalController.create({
                    component: PersonEditModal,
                    componentProps: {
                        person,
                        currentUser: store.currentUser(),
                        tags: this.getTags(),
                        tenantId: store.tenantId(),
                        genders: store.appStore.getCategory('gender'),
                        readOnly: data.readOnly
                    }
                });
                personModal.present();
                const { data: personData, role: personRole } = await personModal.onDidDismiss();
                if (personRole === 'confirm' && personData && !data.readOnly) {
                    await this.save(personData);
                    this.reload();
                }
            }
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
            const postalAddresses = await firstValueFrom(store.firestoreService.searchData<AddressModel>(AddressCollection, [
              { key: 'parentKey', operator: '==', value: 'person.' + person.bkey },
              { key: 'addressChannel', operator: '==', value: 'postal' },
              { key: 'isFavorite', operator: '==', value: true }
            ]));
            const postalAddress = postalAddresses[0];
            if (!postalAddress) return;
            const addressStr = stringifyPostalAddress(postalAddress, Languages[DefaultLanguage].abbreviation ?? 'de');

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
        }
    }
  }),

  withHooks({
    onInit(store) {
      patchState(store, { orgId: store.appStore.appConfig().ownerOrgId });
    }
  })
);
