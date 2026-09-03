import { computed, inject, Injector } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Photo } from '@capacitor/camera';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { AddressCollection, AddressModel, CategoryListModel, DefaultLanguage, MembershipCollection, MembershipModel, OrgModel, PersonModel, PersonModelName, ResourceModel } from '@okr/shared-models';
import { AlertService, copyToClipboardWithConfirmation, getCcEmailAddresses, getMainEmailAddresses, navigateByUrl, showToast } from '@okr/shared-util-angular';
import { chipMatches, debugItemLoaded, getSystemQuery, hasRole, isPerson, nameMatches, PHOTO_USAGE_ALL, photoUsageMatches } from '@okr/shared-util-core';
import { EmailAddressesModal, MapViewModal } from '@okr/shared-ui';
import { openBulkEmailFlow } from '@okr/content-pdf-template-feature';
import { Languages } from '@okr/shared-categories';
import { I18nService } from '@okr/shared-i18n';

import { AddressService, GeocodingService } from '@okr/subject-address-data-access';
import { PersonService, SensitivePersonData } from '@okr/subject-person-data-access';
import { convertFormToNewPerson, convertNewPersonFormToEmailAddress, convertNewPersonFormToMembership, convertNewPersonFormToPhoneAddress, convertNewPersonFormToPostalAddress, convertNewPersonFormToWebAddress, PersonNewFormModel, PERSON_I18N_KEYS, PersonI18n, PersonDuplicateCandidate, ReconcilableField } from '@okr/subject-person-util';
import { browseUrl, stringifyPostalAddress } from '@okr/subject-address-util';

import type { MatrixChatService } from '@okr/chat-data-access';
import { AvatarService } from '@okr/avatar-data-access';
import { VcardExportService } from '@okr/vcard-feature';
import { ActivityService } from '@okr/activity-data-access';


export type PersonState = {
  orgId: string;
  personKey: string | undefined;

  // filter
  searchTerm: string;
  selectedTag: string;
  selectedGender: string;
  // the photo declaration (usageImages) — the filter that makes it consultable (D-P4-10)
  selectedPhotoUsage: string;
};
export const initialState: PersonState = {
  orgId: '',
  personKey: undefined,

  // filter
  searchTerm: '',
  selectedTag: '',
  selectedGender: 'all',
  selectedPhotoUsage: PHOTO_USAGE_ALL,
};

export const PersonStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    addressService: inject(AddressService),
    avatarService: inject(AvatarService),
    router: inject(Router),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    toastController: inject(ToastController),
    geocodeService: inject(GeocodingService),
    // Lazy: a static import of @okr/chat-data-access is the edge that dragged matrix-js-sdk
    // (198 KB transfer) before the dashboard's LCP (spec 1.49, F1). Same accessor as the cms
    // section stores.
    matrixService: ((injector: Injector) => {
      let p: Promise<MatrixChatService> | undefined;
      return () => (p ??= import('@okr/chat-data-access')
        .then(m => injector.get(m.MatrixChatService))
        // A failed chunk load must not poison the cache: drop it so the next call retries.
        .catch(e => { p = undefined; throw e; }));
    })(inject(Injector)),
    activityService: inject(ActivityService),
    vcardExportService: inject(VcardExportService),
    i18nService: inject(I18nService),
  })),

  withComputed((state) => {
    return {
      persons: computed(() => state.appStore.allPersons()),
      // the date of death itself lives in the addresses vault ('dod' channel, spec 1.19);
      // persons carry only the isDeceased marker, which is what a list may filter on.
      deceased: computed(() => state.appStore.allPersons().filter((person: PersonModel) => person.isDeceased === true) ?? []),
      showGender: computed(() => hasRole(state.appStore.privacySettings().showGender, state.appStore.currentUser())),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      membershipCategoryKey: computed(() => state.appStore.getOrg(state.orgId())?.membershipCategoryKey ?? 'mcat'),
      defaultResource : computed(() => state.appStore.defaultResource() ?? new ResourceModel(state.appStore.env.tenantId)),
      defaultMcat: computed(() => state.appStore.tryGetCategory('mcat'))
    };
  }),

  withProps((store) => ({

    i18n: store.i18nService.translateAll(PERSON_I18N_KEYS),

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
          photoUsageMatches(person.usageImages, state.selectedPhotoUsage()) &&
          chipMatches(person.tags, state.selectedTag())) ?? []
      ),
      
      // deceased persons
      deceasedCount: computed(() => state.deceased().length ?? 0), 
      filteredDeceased: computed(() => 
        state.deceased()?.filter((person: PersonModel) => 
          nameMatches(person.index, state.searchTerm()) &&
          nameMatches(person.gender, state.selectedGender(), true) &&
          photoUsageMatches(person.usageImages, state.selectedPhotoUsage()) &&
          chipMatches(person.tags, state.selectedTag())) ?? []
      ),
      membershipCategory: computed<CategoryListModel | undefined>(() => state.appStore.tryGetCategory(state.membershipCategoryKey()) ?? state.defaultMcat()),
      isLoading: computed(() => state.personResource.isLoading()),

      // edit person
      person: computed(() => state.personResource.value()),
      // Privacy preferences (usage*) live on the person, which is tenant-readable, so this
      // works for all viewers (no users-collection query, no permission error).
      privacySettings: computed(() => state.appStore.getPersonPrivacySettings(state.personResource.value())),
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

        /** The photo declaration filter — see D-P4-10; only staff roles get the control. */
        setSelectedPhotoUsage(selectedPhotoUsage: string) {
            patchState(store, { selectedPhotoUsage });
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

        /**
         * Reads the vault-backed ssn/dob of a person (spec 1.19 Phase 4, D9). Both edit
         * surfaces need it: the modal seeds its form from edit() below, the routed
         * person-edit.page hydrates its form after the person stream has emitted.
         * Returns empty values when the caller may not read the vault.
         */
        async loadSensitive(personKey: string): Promise<SensitivePersonData> {
            return await store.personService.loadSensitive(personKey, store.currentUser());
        },

        /******************************** actions ******************************************* */
        async add(readOnly = true): Promise<void> {
            if (readOnly) return;
            const { PersonNewModal } = await import('./person-new.modal');
            const modal = await store.modalController.create({
                component: PersonNewModal,
                componentProps: { org: store.appStore.defaultOrg() }
            });
            modal.present();
            const { data, role } = await modal.onWillDismiss();
            if (role !== 'confirm' || !data) return;
            const p = data as PersonNewFormModel;

            // Cross-tenant duplicate search (callable; memberAdmin-gated server-side).
            const candidates = await store.personService.findDuplicates({
                firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth,
                favEmail: p.email, ssnId: p.ssnId,
            });

            if (candidates.length === 0) {
                await this.createNewPerson(p);
                return;
            }

            const { PersonDuplicateModal } = await import('./person-duplicate.modal');
            const dupModal = await store.modalController.create({
                component: PersonDuplicateModal,
                cssClass: 'list-modal',
                componentProps: { candidates, i18n: store.i18n }
            });
            dupModal.present();
            const { data: chosen, role: dupRole } = await dupModal.onWillDismiss();

            if (dupRole === 'create') {
                await this.createNewPerson(p);
            } else if (dupRole === 'select' && chosen) {
                await this.reusePerson(chosen as PersonDuplicateCandidate, p);
            }
        },

        /** Creates a brand-new person plus its address records and optional membership. */
        async createNewPerson(p: PersonNewFormModel): Promise<void> {
            const personKey = await store.personService.create(convertFormToNewPerson(p, store.tenantId()), store.currentUser());
            store.appStore.reloadPersons();
            const avatarKey = `person.${personKey}`;
            if ((p.email ?? '').length > 0) this.saveAddress(convertNewPersonFormToEmailAddress(p, store.tenantId()), avatarKey);
            if ((p.phone ?? '').length > 0) this.saveAddress(convertNewPersonFormToPhoneAddress(p, store.tenantId()), avatarKey);
            if ((p.web ?? '').length > 0) this.saveAddress(convertNewPersonFormToWebAddress(p, store.tenantId()), avatarKey);
            if ((p.city ?? '').length > 0) this.saveAddress(convertNewPersonFormToPostalAddress(p, store.tenantId()), avatarKey);
            if ((p.email ?? '').length > 0 || (p.phone ?? '').length > 0 || (p.web ?? '').length > 0 || (p.city ?? '').length > 0) {
                store.appStore.reloadAddressDirectory();
            }
            if (p.shouldAddMembership && (p.orgKey ?? '').length > 0 && (p.membershipCategory ?? '').length > 0) {
                await this.saveMembership(p, personKey);
            }
        },

        /**
         * Reuses an existing person: reconcile differing fields, share into the current tenant,
         * add any new contact channels, and optionally create a membership.
         */
        async reusePerson(candidate: PersonDuplicateCandidate, p: PersonNewFormModel): Promise<void> {
            const { PersonReconcileModal } = await import('./person-reconcile.modal');
            const recModal = await store.modalController.create({
                component: PersonReconcileModal,
                componentProps: { existing: candidate, form: p, i18n: store.i18n }
            });
            recModal.present();
            const { data: resolved, role } = await recModal.onWillDismiss();
            if (role !== 'confirm') return;

            await store.personService.mergeIntoTenant(
                candidate.okey, store.tenantId(),
                (resolved ?? {}) as Partial<Record<ReconcilableField, string>>);

            // Non-destructive: add contact channels not already represented by the person's fav fields.
            const avatarKey = `person.${candidate.okey}`;
            if ((p.email ?? '').length > 0 && p.email !== candidate.favEmail) this.saveSecondaryAddress(convertNewPersonFormToEmailAddress(p, store.tenantId()), avatarKey);
            if ((p.phone ?? '').length > 0 && p.phone !== candidate.favPhone) this.saveSecondaryAddress(convertNewPersonFormToPhoneAddress(p, store.tenantId()), avatarKey);
            if ((p.web ?? '').length > 0) this.saveSecondaryAddress(convertNewPersonFormToWebAddress(p, store.tenantId()), avatarKey);
            if ((p.city ?? '').length > 0) this.saveSecondaryAddress(convertNewPersonFormToPostalAddress(p, store.tenantId()), avatarKey);
            if (p.shouldAddMembership && (p.orgKey ?? '').length > 0 && (p.membershipCategory ?? '').length > 0) {
                await this.saveMembership(p, candidate.okey);
            }
            this.reload();
            store.appStore.reloadPersons();
            store.appStore.reloadAddressDirectory();
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
                store.i18n.add_membership_conf(), store.i18n.add_membership_error(), store.appStore.currentUser());
        },

        async save(person: PersonModel): Promise<void> {
            await (!person.okey ?
            store.personService.create(person, store.currentUser()) :
            store.personService.update(person, store.currentUser()));
            store.appStore.reloadPersons();
        },

        saveAddress(address: AddressModel, avatarKey: string): void {
            address.parentKey = avatarKey;
            store.addressService.create(address, store.currentUser());
        },

        /** Saves an address as NON-favorite (used when reusing an existing person who may already have favorites). */
        saveSecondaryAddress(address: AddressModel, avatarKey: string): void {
            address.isFavorite = false;
            this.saveAddress(address, avatarKey);
        },

        async saveAvatar(photo: Photo, okey: string): Promise<void> {
          if (!okey) return;
          await store.avatarService.saveAvatarPhoto(photo, okey, store.appStore.env.tenantId, PersonModelName);
          store.personResource.reload();
          store.appStore.reloadPersons();
        },

        async export(type: string): Promise<void> {
            console.log(`PersonStore.export(${type}) ist not yet implemented`);
        },

        /**
         * Export a single person as a vCard (.vcf), scoped by the caller's role
         * (spec 17). Routes through the VcardExportService → vcardExport callable.
         */
        async exportVcard(person: PersonModel): Promise<void> {
            const displayName = `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || person.lastName;
            await store.vcardExportService.exportSingle(
                { okey: person.okey, displayName },
                'person',
                store.currentUser()?.roles,
                store.tenantId()
            );
        },

        async edit(person: PersonModel, readOnly = true): Promise<void> {
            // ssn/dob are NOT passed in: PersonEditModal hydrates them from the addresses
            // vault itself (spec 1.19 Phase 4, D9), so every opener of that modal is correct.
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
                data.okey?.length === 0 ? 
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
                store.appStore.reloadPersons();
            }
        },

        async copyEmailAddresses(readOnly = true): Promise<void> {
            const persons = store.filteredPersons();
            const mainEmails = getMainEmailAddresses(persons, (p) => store.appStore.getDirectoryEntry(`person.${p.okey}`)?.favEmail);

            const ccQuery = getSystemQuery(store.tenantId());
            ccQuery.push({ key: 'addressChannel', operator: '==', value: 'email' });
            ccQuery.push({ key: 'isCc', operator: '==', value: true });
            const allCcAddresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, ccQuery, 'none');
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

        /**
         * Bulk mail to the currently filtered persons: first the distribution-list modal
         * (to/cc/bcc), then the email composer, which sends the mail in throttled blocks.
         */
        async sendEmailToList(): Promise<void> {
          const persons = store.filteredPersons();
          const recipients = getMainEmailAddresses(persons, (p) => store.appStore.getDirectoryEntry(`person.${p.okey}`)?.favEmail);
          await openBulkEmailFlow({
            modalController: store.modalController,
            firestoreService: store.firestoreService,
            appStore: store.appStore,
            tenantId: store.tenantId(),
          }, recipients);
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
          try {
            // Matrix is initialized in the background after login (MatrixInitializationService).
            // Await the idempotent, promise-cached init so opening a direct chat works even
            // before the user has visited the chat overview (which otherwise primes the client).
            const matrix = await store.matrixService();
            await matrix.ensureInitialized();
            const room = await matrix.createDirectRoom(person.okey);
            await navigateByUrl(store.router, '/private/chat/c-contentpage', { selectedRoom: room.roomId });
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Could not start chat';
            void store.activityService.log('chat', 'createdirect', store.currentUser(), `ERROR: ${person.okey} ${msg}`);
            await showToast(store.toastController, msg);
          }
        },

        async isPersonUser(personKey: string): Promise<boolean> {
            return store.firestoreService.isPersonUser(personKey);
        },

        /**
         * Open a user account for a person (memberAdmin/admin only). The same
         * operation runs automatically when the person gains an active membership in
         * the default org — see syncPersonAccount / onMembershipAccountSync
         * (planning/specs/2026-08-12-membership-account-sync-design.md).
         */
        async openUserAccount(person?: PersonModel): Promise<void> {
            if (!person) return;
            await this.syncUserAccount(person, 'open', store.i18n.open_account_conf());
        },

        /** Close a person's user account: deletes users/{uid}, keeps the Auth identity. */
        async closeUserAccount(person?: PersonModel): Promise<void> {
            if (!person) return;
            const confirmed = await store.alertService.confirm(store.i18n.close_account_confirm(), true);
            if (confirmed !== true) return;
            await this.syncUserAccount(person, 'close', store.i18n.close_account_conf());
        },

        async syncUserAccount(person: PersonModel, action: 'open' | 'close', confirmation: string): Promise<void> {
            try {
                const functions = getFunctions(getApp(), 'europe-west6');
                const syncPersonAccount = httpsCallable(functions, 'syncPersonAccount');
                await syncPersonAccount({ personKey: person.okey, tenantId: store.tenantId(), action });
                await showToast(store.toastController, confirmation);
            } catch (error) {
                const msg = error instanceof Error ? error.message : store.i18n.account_error();
                void store.activityService.log('user', action === 'open' ? 'create' : 'delete', store.currentUser(), `ERROR: ${person.okey} ${msg}`);
                await showToast(store.toastController, store.i18n.account_error());
            }
        },


        async showOnMap(person?: PersonModel): Promise<void> {
            if (!person) return;
            const postalAddresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, [
              { key: 'parentKey', operator: '==', value: 'person.' + person.okey },
              { key: 'addressChannel', operator: '==', value: 'postal' },
              { key: 'isFavorite', operator: '==', value: true }
            ], 'none');
            const postalAddress = postalAddresses[0];
            if (!postalAddress) return;
            const addressStr = stringifyPostalAddress(postalAddress, Languages[DefaultLanguage].abbreviation ?? 'de');

            const coordinates = await store.geocodeService.geocodeAddress(addressStr);
            if (!coordinates) return;
            const modal = await store.modalController.create({
                component: MapViewModal,
                cssClass: 'map-modal',
                componentProps: {
                title: addressStr,
                center: { lat: coordinates.lat, lng: coordinates.lng, title: addressStr }
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
