import { computed, inject, Injectable, Injector } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ExportFormats, memberTypeMatches, yearMatches } from '@okr/shared-categories';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { AddressCollection, AddressModel, CategoryListModel, ExportFormat, GroupModel, GroupModelName, MembershipCollection, MembershipModel, OrgModel, OrgModelName, OwnershipCollection, OwnershipModel, PersonModel, PersonModelName } from '@okr/shared-models';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, generateRandomString, getAvatarInfo, getBirthYear, getCatAbbreviation, getDataRow, getFullName, getSystemQuery, getTodayStr, isAfterDate, isAfterOrEqualDate, isMembership, isOngoing, isPerson, nameMatches, warn } from '@okr/shared-util-core';
import { confirm, copyToClipboardWithConfirmation, exportCsv, getCcEmailAddresses, getMainEmailAddresses, navigateByUrl, showToast } from '@okr/shared-util-angular';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';
import { EmailAddressesModal, selectDate } from '@okr/shared-ui';
import { openBulkEmailFlow } from '@okr/content-pdf-template-feature';

import { OwnershipService } from '@okr/relationship-ownership-data-access';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { convertFormToNewPerson, convertMemberAndOrgToMembership, convertNewMemberFormToEmailAddress, convertNewMemberFormToMembership, convertNewMemberFormToPhoneAddress, convertNewMemberFormToPostalAddress, convertNewMemberFormToWebAddress, convertToAddressDataRow, convertToClubdeskImportRow, convertToSrvDataRow, getGroupsOfMember, getRelLogEntry, MemberContact, MemberNewFormModel, MEMBERSHIP_I18N_KEYS } from '@okr/relationship-membership-util';
import { AddressService } from '@okr/subject-address-data-access';
import { PersonService } from '@okr/subject-person-data-access';
import { PERSON_EDIT_MODAL } from '@okr/subject-person-ui';
import { browseUrl } from '@okr/subject-address-util';
import type { MatrixChatService } from '@okr/chat-data-access';
import { InvoiceNewModal } from '@okr/finance-invoice-feature';
import { VcardExportService, VcardExportTarget } from '@okr/vcard-feature';

import { MemberNewModal } from './member-new.modal';

import { MembershipEditModal } from './membership-edit.modal';
import { ActivityService } from '@okr/activity-data-access';

export type MembershipState = {
  orgId: string;  // the organization to which the memberships belong (can be org or group)
  orgType: 'org' | 'group';
  listId: string;  // the current list view (active, exits, etc.) - used to detect view changes and reset filters
  showOnlyCurrent: boolean;  // whether to show only current memberships or all memberships that ever existed
  version: number; // used to trigger reload of resources when it changes (e.g. after adding/editing a membership) to avoid calling reload() directly from the modal which would cause issues with the modal closing before the reload is finished

  // for accordion-like display of memberships of a given member
  member: PersonModel | OrgModel | GroupModel | undefined;
  modelType: 'person' | 'org' | 'group' | undefined;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedMembershipCategory: string;
  selectedYear: number;
  selectedGender: string;
  selectedOrgType: string;
  yearField: 'dateOfEntry' | 'dateOfExit';
};

const initialState: MembershipState = {
  orgId: '',
  orgType: 'org',
  listId: '',
  showOnlyCurrent: true,
  version: 0,

  member: undefined,
  modelType: undefined,

  searchTerm: '',
  selectedTag: '',
  selectedMembershipCategory: 'all',
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedGender: 'all',
  selectedOrgType: 'all',
  yearField: 'dateOfEntry',
};

export const _MembershipStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    alertController: inject(AlertController),
    router: inject(Router),
    personService: inject(PersonService),
    addressService: inject(AddressService),
    ownershipService: inject(OwnershipService),
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
    personEditModalClass: inject(PERSON_EDIT_MODAL, { optional: true }),
    i18nService: inject(I18nService),
    // Tiered vault read (spec 1.19 Phase 4, D-P4-1): full dob for exports comes from the
    // getAddressView callable (memberAdmin tier), never from the person doc.
    getAddressViewFn: httpsCallable<{ parentKeys: string[] }, { views: Record<string, AddressModel[]> }>(
      getFunctions(getApp(), 'europe-west6'),
      'getAddressView'
    )
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(MEMBERSHIP_I18N_KEYS),

    // all memberships of this tenant
    allMembershipsResource: rxResource({  
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version()
      }),
      stream: ({params}) => {
        // Gate on an authenticated user: memberships is a protected collection. Without this,
        // a logout while a membership view is still mounted reloads the resource with no user
        // and queries memberships → permission-denied. (Matches ScsMemberFeesStore.)
        if (!params.currentUser) return of([]);
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.tenantId()), 'memberName2', 'asc').pipe(
          debugListLoaded('MembershipStore.allMemberships', params.currentUser)
        );
      },
    }),
      // Loads all ownerships for a given member (if it is a person)
    ownershipsOfMemberResource: rxResource({
      params: () => ({
        member: store.member(),
        modelType: store.modelType()
      }),
      stream: ({params}) => {
        if (!params.member || !params.modelType || params.modelType !== 'person') return of([]);

        // Query ownerships where ownerKey == memberKey and ownerModelType == 'person'
        return store.firestoreService.searchData<OwnershipModel>(
          OwnershipCollection,
          [
            { key: 'ownerKey', operator: '==', value: params.member.okey },
            { key: 'ownerModelType', operator: '==', value: 'person' },
            { key: 'state', operator: '==', value: 'active' },
            { key: 'tenants', operator: 'array-contains', value: store.appStore.tenantId() }
          ],
          'resourceName',
          'asc'
        );
      },
    }),
  })),

  withComputed((state) => {
    return {
      // all memberships, either only the current ones or all that ever existed (based on showOnlyCurrent)
      allMemberships: computed(() => state.showOnlyCurrent() ? 
        state.allMembershipsResource.value()?.filter(m => isAfterDate(m.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? [] : 
        state.allMembershipsResource.value()?.filter(m => m.relIsLast === true) ?? []),
      defaultMcat: computed(() => state.appStore.tryGetCategory('mcat')),
      ownershipsOfMember: computed(() => state.ownershipsOfMemberResource.value() ?? []),
    };
  }),

  withComputed((state) => {
    return {
      // members of a given org or group (if orgId is set), otherwise []
      members: computed(() => { 
        return state.allMemberships()?.filter((membership: MembershipModel) => 
          membership.orgKey === state.orgId() &&
          membership.orgModelType === state.orgType()
        ) ?? []
      }),

      // memberships of the current member 
      memberships: computed(() => {
        if (!state.member() || !state.modelType) return [];
        return state.allMemberships()?.filter((membership: MembershipModel) => 
          membership.memberKey === state.member()?.okey && 
          membership.memberModelType === state.modelType()) ?? []
      }),

      org: computed(() => state.orgType() === 'org' ? state.appStore.getOrg(state.orgId()) : undefined),
      group: computed(() => state.orgType() === 'group' ? state.appStore.getGroup(state.orgId()) : undefined),
      currentUser: computed(() => state.appStore.currentUser()),
      genders: computed(() => state.appStore.getCategory('gender')),
      privacySettings: computed(() => state.appStore.privacySettings()),
      orgTypes: computed(() => state.appStore.getCategory('org_type')),
      tenantId: computed(() => state.appStore.tenantId()),
    };   
  }),

  withComputed((state) => {
    return {
      orgName: computed(() => state.org()?.name ?? ''),
      groupsOfMember: computed(() => getGroupsOfMember(state.memberships(), state.member()?.okey) ?? []),

      membershipCategoryKey: computed(() => {
        if (state.orgType() === 'group') return undefined;
        const org = state.org() as OrgModel | undefined;
        return org?.membershipCategoryKey ?? 'mcat';
      }),

      personMembers: computed(() => state.members().filter((membership: MembershipModel) =>
        membership.memberModelType === 'person') ?? []),

      orgMembers: computed(() => state.members().filter((membership: MembershipModel) =>
        membership.memberModelType === 'org') ?? []),

      appliedMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.state === "applied") ?? []),

      activeMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.state === "active") ?? []),

      passiveMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.state === "passive") ?? []),

      cancelledMembers: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.relIsLast === true &&
        isAfterOrEqualDate(getTodayStr(DateFormat.StoreDate), membership.dateOfExit) &&
        membership.state === "cancelled") ?? []),

      deceasedMembers: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.memberIsDeceased === true) ?? []),

      entries: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.order === 1 && 
        isAfterOrEqualDate(state.selectedYear() + '1231', membership.dateOfEntry)) ?? []),

      exits: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() &&
        membership.memberModelType === 'person' &&
        membership.relIsLast === true && 
        isAfterOrEqualDate(state.selectedYear() + '1231', membership.dateOfExit)) ?? []),
    };
  }),

  withComputed((state) => {
    return {
      // Resilient lookup: returns undefined while the categories resource is still
      // loading (or if the configured category is missing) instead of crashing via
      // AppStore.getCategory's die(). Consumers in the template guard on isLoading();
      // action methods only run once data is loaded.
      membershipCategory: computed<CategoryListModel | undefined>(() => {
        const key = state.membershipCategoryKey();
        return state.appStore.tryGetCategory(key) ?? state.defaultMcat();
      }),
      groupsCount: computed(() => state.groupsOfMember().length),
      defaultOrg: computed(() => state.org()),
      currentPerson : computed(() => state.appStore.currentPerson()),
      
      isLoading: computed(() =>
        state.allMembershipsResource.isLoading() ||
        state.appStore.orgsResource.isLoading() ||
        state.appStore.categoriesResource.isLoading()
      ),

      // all members (= orgs and persons)
      membersCount: computed(() => state.members().length), 
      filteredMembers: computed(() => 
        state.members()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // person members
      personsCount: computed(() => state.personMembers().length), 
      filteredPersons: computed(() => {
        return state.personMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.category, state.selectedMembershipCategory()) &&
          nameMatches(membership.memberType, state.selectedGender(), true) &&
          chipMatches(membership.tags, state.selectedTag()))
      }
      ),

      // all orgs
      orgsCount: computed(() => state.orgMembers().length), 
      filteredOrgs: computed(() => 
        state.orgMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedOrgType()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // applied memberships
      appliedCount: computed(() => state.appliedMembers().length), 
      filteredApplied: computed(() => 
        state.appliedMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // active memberships
      activeCount: computed(() => state.activeMembers().length), 
      filteredActive: computed(() => 
        state.activeMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.category, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // passive memberships
      passiveCount: computed(() => state.passiveMembers().length), 
      filteredPassive: computed(() => 
        state.passiveMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // cancelled memberships
      cancelledCount: computed(() => state.cancelledMembers().length), 
      filteredCancelled: computed(() => 
        state.cancelledMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.category, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // deceased members
      deceasedCount: computed(() => state.deceasedMembers().length), 
      // the year filter runs on memberDeathYear (YYYY): the full date is vault-only
      // (spec 1.19 'dod' channel), the year is the degraded-precision replica.
      filteredDeceased: computed(() =>
        state.deceasedMembers()?.filter((membership: MembershipModel) =>
          nameMatches(membership.index, state.searchTerm()) &&
          yearMatches(membership.memberDeathYear, state.selectedYear()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // entries
      entriesCount: computed(() => state.entries().length), 
      filteredEntries: computed(() => 
        state.entries()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          yearMatches(membership.dateOfEntry, state.selectedYear()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // entries
      exitsCount: computed(() => state.exits().length), 
      filteredExits: computed(() => 
        state.exits()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          yearMatches(membership.dateOfExit, state.selectedYear()) &&
          chipMatches(membership.tags, state.selectedTag()))
      )
    }
  }),

  withMethods((store) => {

    return {
      refreshData() {
        patchState(store, { version: store.version() + 1 });
      },

      /******************************** setters (filter) ******************************************* */
      setOrgId(orgId?: string, orgType: 'org' | 'group' = 'org') {
        if (!orgId) orgId = store.appStore.defaultOrg()?.okey;
        // Only reset filters if orgId actually changed
        if (store.orgId() !== orgId) {
          patchState(store, { 
            orgId,
            orgType,
            searchTerm: '',
            selectedTag: '',
            selectedMembershipCategory: 'all',
            selectedGender: 'all',
            selectedOrgType: 'all'
          });
        }
      },

      setListId(listId: string) {
        patchState(store, { listId });
      },

      resetFilters() {
        patchState(store, {
          searchTerm: '',
          selectedTag: '',
          selectedMembershipCategory: 'all',
          selectedYear: parseInt(getTodayStr(DateFormat.Year)),
          selectedGender: 'all',
          selectedOrgType: 'all'
        });
      },

      setYearField(yearField: 'dateOfEntry' | 'dateOfExit') {
        patchState(store, { yearField });
      },
      
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedMembershipCategory(selectedMembershipCategory: string) {
        patchState(store, { selectedMembershipCategory });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedGender(selectedGender: string) {
        patchState(store, { selectedGender });
      },

      setSelectedOrgType(selectedOrgType: string) {
        patchState(store, { selectedOrgType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setMember(member: PersonModel | OrgModel | GroupModel, modelType: 'person' | 'org' | 'group'): void {
        patchState(store, { member, modelType });
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('membership');
      },

      // contact data from the address-directory projection (spec 1.19 Phase 4)
      getEmail(membership: MembershipModel): string | undefined {
        const parentKey = `${membership.memberModelType ?? 'person'}.${membership.memberKey}`;
        return store.appStore.getDirectoryEntry(parentKey)?.favEmail;
      },

      getPhone(membership: MembershipModel): string | undefined {
        const parentKey = `${membership.memberModelType ?? 'person'}.${membership.memberKey}`;
        return store.appStore.getDirectoryEntry(parentKey)?.favPhone;
      },

      /******************************** actions ******************************************* */
      /**
       * Show a modal to add a new membership. The current org from the membership store is used as default org.
       * Initially, the modal proposes to add the current person as member to the default org.
       * @param readOnly whether the membership is added in readOnly mode (no editing possible)
       */
      async add(readOnly = true): Promise<void> {
        if (readOnly) { console.log('MembershipStore.add: readOnly mode.'); return; }
        const member = store.member() ?? store.appStore.currentPerson();
        const org = store.org();
        if (!member) { console.log('MembershipStore.add: no member.'); return; }
        if (!org) { console.log('MembershipStore.add: no org.'); return; }
        this.setOrgId(org.okey);
        const membership = convertMemberAndOrgToMembership(member, PersonModelName, org, OrgModelName, store.tenantId());
        this.edit(membership, readOnly, true);
      },

      /**
       * Add a person to a given group as a member.
       * First shows a person select modal so the user can pick any person.
       * The group stays fix.
       * @param group
       * @param readOnly
       * @returns
       */
      async addMemberToGroup(group: GroupModel, readOnly = true): Promise<void> {
        if (readOnly) { console.log('MembershipStore.addMemberToGroup: readOnly mode.'); return; }
        const modal = await store.modalController.create({
          component: PersonSelectModal,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser(),
          },
        });
        modal.present();
        const { data: result, role } = await modal.onWillDismiss<PersonSelectResult>();
        const data = result?.kind === 'predefined' ? result.person : undefined;
        if (role !== 'confirm') return;
        if (!isPerson(data, store.tenantId())) { console.log('MembershipStore.addMemberToGroup: no valid person selected.'); return; }
        const member = data as PersonModel;
        const memberAvatar = getAvatarInfo(member, 'person');
        const groupAvatar = getAvatarInfo(group, 'group');
        if (memberAvatar && groupAvatar && await store.membershipService.isMemberOf(memberAvatar, groupAvatar)) {
          await showToast(store.toastController, store.i18n.create_alreadyMember());
          return;
        }
        const membership = convertMemberAndOrgToMembership(member, PersonModelName, group, GroupModelName, store.tenantId());
        this.edit(membership, readOnly, true);
      },

      /**
       * Make an EXISTING person a member of a given org — the promotion step of an approved
       * application (roadmap A3): `ApplicationService.accept()` has already created the person
       * and its addresses, so only the membership document is missing. The category and the
       * rebate stay a human decision, hence the prefilled edit modal instead of a silent write.
       * Opening the user account and the follow-up rules are server-side (spec 1.35 / 4.60).
       */
      async addExistingPersonToOrg(person: PersonModel, org: OrgModel): Promise<void> {
        const memberAvatar = getAvatarInfo(person, 'person');
        const orgAvatar = getAvatarInfo(org, 'org');
        if (memberAvatar && orgAvatar && await store.membershipService.isMemberOf(memberAvatar, orgAvatar)) {
          await showToast(store.toastController, store.i18n.create_alreadyMember());
          return;
        }
        const membership = convertMemberAndOrgToMembership(person, PersonModelName, org, OrgModelName, store.tenantId());
        await this.edit(membership, false, true);
      },

      /**
       * Show a modal to create a new person and add it as member to the current org.
       * The current org from the membership store is used as default org in the person creation modal.
       */
      async addNewMember(): Promise<void> {
        const tenantId = store.tenantId();
        const modal = await store.modalController.create({
          component: MemberNewModal,
          componentProps: {
            currentUser: store.currentUser(),
            mcat: store.membershipCategory(),
            tags: this.getTags(),
            tenantId,
            genders: store.genders(),
            org: store.org() 
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) {
          const newMember = data as MemberNewFormModel;
          // Lightweight name-only duplicate warning (restored after checkIfExists was removed
          // from PersonService). Full cross-tenant duplicate detection lives in PersonStore.add().
          const searchFirst = (newMember.firstName ?? '').trim().toLowerCase();
          const searchLast = (newMember.lastName ?? '').trim().toLowerCase();
          const alreadyExists = store.appStore.allPersons().some((p) =>
            (p.firstName ?? '').trim().toLowerCase() === searchFirst &&
            (p.lastName ?? '').trim().toLowerCase() === searchLast);
          if (alreadyExists) {
            if (!await confirm(store.alertController, store.i18n.create_alreadyMember(), store.i18n.ok(), store.i18n.cancel(), true)) return;
          }

          const personKey = await store.personService.create(convertFormToNewPerson(newMember, tenantId), store.currentUser());
          const avatarKey = `person.${personKey}`;
          if (newMember.email.length > 0) {
            this.saveAddress(convertNewMemberFormToEmailAddress(newMember, tenantId), avatarKey);
          }
          if (newMember.phone.length > 0) {
            this.saveAddress(convertNewMemberFormToPhoneAddress(newMember, tenantId), avatarKey);
          }
          if (newMember.web.length > 0) {
            this.saveAddress(convertNewMemberFormToWebAddress(newMember, tenantId), avatarKey);
          }
          if (newMember.city.length > 0) {
            this.saveAddress(convertNewMemberFormToPostalAddress(newMember, tenantId), avatarKey);
          }
          if (newMember.orgKey.length > 0 && newMember.category.length > 0) {
            await this.saveMembership(newMember, personKey);
          }
          this.refreshData();
        }
      },

        /**
       * Add the membership to the new person and make it a member.
       * We do not want to use MembershipService.create() in order to avoid the dependency to the membership module
       * @param vm  the form data for a new member
       * @param personKey the key of the newly created person
       */
      async saveMembership(vm: MemberNewFormModel, personKey?: string): Promise<string | undefined> {
        if (!personKey || personKey.length === 0) {
          console.warn('MembershipStore.saveMembership: personKey is empty, cannot save membership');
          return undefined;
        }
        const mcatAbbreviation = getCatAbbreviation(store.membershipCategory(), vm.category);
        const membership = convertNewMemberFormToMembership(vm, personKey, store.tenantId(), mcatAbbreviation);
        membership.index = 'mn:' + membership.memberName1 + ' ' + membership.memberName2 + ' mk:' + membership.memberKey + ' ok:' + membership.orgKey;
        // Consequences of a new membership (notify the treasurer, …) are workflow rules
        // evaluated server-side by the memberships trigger — spec 1.35, no client code.
        return await store.firestoreService.createModel<MembershipModel>(MembershipCollection, membership, store.i18n.create_conf(), store.i18n.create_error(), store.appStore.currentUser());
      },

      saveAddress(address: AddressModel, avatarKey: string): void {
        address.parentKey = avatarKey;
        store.addressService.create(address, store.currentUser());
      },

      /**
       * Show a modal to edit an existing membership.
       * @param membership the membership to edit
       */
      async edit(membership?: MembershipModel, readOnly = true, isNew = false): Promise<void> {
        if (!membership) return;

        const modal = await store.modalController.create({
          component: MembershipEditModal,
          cssClass: 'auto-height-modal',
          componentProps: {
            membership,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            isNew,
            priv: store.privacySettings(),
            mcat: store.membershipCategory(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isMembership(data, store.tenantId())) {
            const mcatAbbreviation = getCatAbbreviation(store.membershipCategory(), data.category);
            data.relLog = getRelLogEntry(data.dateOfEntry, mcatAbbreviation);
            // memberBirthYear can no longer be derived from the person doc (spec 1.19
            // Phase 4 strip) — resolve it from the vault when the form left it empty.
            if (data.memberModelType === PersonModelName && !data.memberBirthYear && data.memberKey) {
              const dobByKey = await this.loadVaultDobs([data.memberKey]);
              data.memberBirthYear = getBirthYear(dobByKey.get(data.memberKey) ?? '');
            }
            if (!data.okey) {
              // create new membership. The follow-up tasks are workflow rules (spec 1.35),
              // evaluated server-side by the memberships trigger.
              store.membershipService.create(data, store.currentUser());
              if (data.orgModelType === GroupModelName && data.memberModelType === PersonModelName) {
                // invite the new member to the group's Matrix chat room
                try {
                  const matrix = await store.matrixService();
                  await matrix.inviteToGroupRoom(data.orgKey, data.memberKey);
                } catch (err) {
                  console.warn('MembershipStore.edit: Could not invite to group chat:', err);
                }
              }
            } else { // update existing membership
              store.membershipService.update(data, store.currentUser());
            }
          }
        }
        this.refreshData();
      },

      /**
         * Ask user for the end date of an existing membership and end it.
         * We do not archive memberships as we want to make them visible for entries & exits.
         * Therefore, we end an membership by setting its validTo date.
         * @param membership the membership to end
         */
      async end(membership: MembershipModel, endDate?: string, readOnly = true): Promise<void> {
        if (!membership || readOnly) return;
        if (!endDate) {
          endDate =  await selectDate(store.modalController, getTodayStr(DateFormat.IsoDate), store.i18n.end_select(), store.i18n.end_intro());
        }
        if (!endDate) { 
          warn('MembershipStore.end: no end date selected, cannot end membership');
          return;
        }
        const sDate = convertDateFormatToString(endDate.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate, false);
        await store.membershipService.endMembershipByDate(membership, sDate, store.currentUser());
        // No eager kickFromGroupRoom here: onMembershipWritten does the removal server-side
        // and is date-aware (spec 1.34) — kicking from the client would throw a member with a
        // FUTURE exit date out of their rooms months early. The follow-up tasks (treasurer,
        // resourceAdmin) are workflow rules evaluated server-side (spec 1.35).
      },

      /**
       * Exports the member of the given membership as a vCard (.vcf), importable into
       * Apple/Google Contacts (spec 17_spec-vcard-export). The actual scope of the export
       * (favorites-only vs. full, with/without a scope dialog) is decided by the caller's
       * role and re-enforced server-side by the `vcardExport` callable. The membership only
       * provides the target identity; `readOnly` does not gate it (export is a read operation).
       * @param membership the membership whose member (person or org) is exported
       */
      async downloadVcard(membership: MembershipModel): Promise<void> {
        if (!membership) return;
        const kind = membership.memberModelType === PersonModelName ? 'person' : 'org';
        const target: VcardExportTarget = {
          okey: membership.memberKey,
          displayName: kind === 'person'
            ? getFullName(membership.memberName1, membership.memberName2)
            : (membership.memberName2 || membership.memberName1),
        };
        await store.vcardExportService.exportSingle(target, kind, store.currentUser()?.roles, store.appStore.tenantId());
      },

      /**
       * Creates a direct message room between the current user and the given member (membership.memberKey)
       * Opens the Chat Page and preselects this room.
       * @param membership the membership represents the other end of the direct chat.
       * 
       */
      async chat(membership: MembershipModel): Promise<void> {
        try {
          // Matrix is initialized in the background after login (MatrixInitializationService).
          // Await the idempotent, promise-cached init so opening a direct chat works even
          // before the user has visited the chat overview (which otherwise primes the client).
          const matrix = await store.matrixService();
          await matrix.ensureInitialized();
          const room = await matrix.createDirectRoom(membership.memberKey);
          void store.activityService.log('chat', 'createdirect', store.currentUser(), `SUCCESS: ${membership.memberKey}`);
          await navigateByUrl(store.router, '/private/chat/c-contentpage', { selectedRoom: room.roomId });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Could not start chat';
          void store.activityService.log('chat', 'createdirect', store.currentUser(), `ERROR: ${membership.memberKey} ${msg}`);
          await showToast(store.toastController, msg);
        }
      },

      async isPersonUser(personKey: string): Promise<boolean> {
        return store.firestoreService.isPersonUser(personKey);
      },

      async changeMembershipCategory(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (readOnly || !membership) return;
        this.setOrgId(membership.orgKey);
        const membershipCategory = store.membershipCategory();
        if (membershipCategory) {
          const { CategoryChangeModal } = await import('./membership-category-change.modal');
          const modal = await store.modalController.create({
            component: CategoryChangeModal,
            componentProps: {
              membership,
              membershipCategory,
              currentUser: store.currentUser()
            }
          });
          modal.present();
          const { data, role } = await modal.onDidDismiss();
          if (role === 'confirm' && data !== undefined) {   // result is vm: CategoryChangeFormModel
            // The category write emits membership.categoryChanged; who gets told about a
            // switch to passive is a workflow rule now (spec 1.35), not an if block here.
            await store.membershipService.saveMembershipCategoryChange(membership, data, membershipCategory, store.currentUser());
          }
          this.refreshData();
        }
      },


      async export(type: string, memberships: MembershipModel[]): Promise<void> {
        let keys: (keyof MembershipModel)[] = [];
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
        let tableName = '';

        // Batch-load all favorite postal addresses once for all export types
        const postalQuery = getSystemQuery(store.tenantId());
        postalQuery.push({ key: 'addressChannel', operator: '==', value: 'postal' });
        postalQuery.push({ key: 'isFavorite', operator: '==', value: true });
        const allPostal = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, postalQuery, 'none');
        const postalByPersonKey = new Map<string, AddressModel>();
        for (const a of allPostal) {
          if (a.parentKey?.startsWith('person.')) {
            postalByPersonKey.set(a.parentKey.substring('person.'.length), a);
          }
        }

        switch(type) {
          case 'raw':
            keys = Object.keys(new MembershipModel(store.appStore.tenantId())) as (keyof MembershipModel)[];
            table.push(keys);
            tableName = 'Rohdaten Mitgliedschaften';
            break;
          case 'srv':
            table.push(['Clubname', 'MGRART_Titel', 'Beitrag', 'LastName', 'FirstName', 'SrvId', 'Birthday', 'Street', 'Postcode', 'City', 'Mobile', 'Email', 'Funktion', 'Kommentar']);
            await this.exportSrv(table, postalByPersonKey);
            exportCsv(table, fn, 'SRV Mitgliedschaften');
            return;
          case 'address':
            table.push(['Vorname', 'Name', 'Strasse', 'PLZ', 'Ort', 'Tel', 'E-Mail']);
            for (const member of memberships) {
              const person = store.appStore.getPerson(member.memberKey);
              if (!person) continue;
              table.push(convertToAddressDataRow(person, this.getMemberContact(member.memberKey), postalByPersonKey.get(member.memberKey)));
            }
            exportCsv(table, fn, 'Adressliste');
            return;
          case 'clubdesk': {
            table.push(['Vorname', 'Nachname', 'Geschlecht', 'Anrede', 'Adresse', 'Ort', 'PLZ', 'Land', 'E-Mail', 'Telefon', 'Geburtsdatum', 'Eintritt', 'BexioId', 'Kategorie', 'Status', 'Funktion', 'RelLog']);
            const dobByKey = await this.loadVaultDobs(memberships.map(m => m.memberKey));
            for (const member of memberships) {
              const person = store.appStore.getPerson(member.memberKey);
              if (!person) continue;
              table.push(convertToClubdeskImportRow(member, person, this.getMemberContact(member.memberKey, dobByKey), postalByPersonKey.get(member.memberKey)));
            }
            exportCsv(table, fn, 'Clubdesk Import');
            return;
          }
          case 'member':
            keys = ['memberId', 'memberName1', 'memberName2', 'memberBirthYear', 'dateOfEntry', 'memberCategory', 'orgFunction'] as (keyof MembershipModel)[];
            table.push(['Mitgliedschafts-Nr', 'Vorname', 'Name', 'Jahrgang', 'Eintrittsdatum', 'Kategorie', 'Funktion']);
            tableName = 'Mitglieder';
            break;
          default:
            console.error(`MembershipStore.export: unknown export type ${type}`);
            return;
        }
        for (const member of memberships) {
          table.push(getDataRow<MembershipModel>(member, keys));
        }
        exportCsv(table, fn, tableName);
      },

      async exportSrv(table: string[][], postalByPersonKey: Map<string, AddressModel>): Promise<void> {
        // hardcoded and not considering any current membership filters.
        // That's why it can be used from any membership (SCS, SRV, other).
        // Get all persons
        const persons = store.appStore.allPersons();
        // Get all memberships (stateless)
        const allMemberships = store.allMembershipsResource.value() ?? [];
        const lastYear = (new Date()).getFullYear() - 1;

        // select the exported persons first, then batch-load their full dob from the vault
        const rows: { person: PersonModel; currentScs?: MembershipModel; lastYearExit?: MembershipModel; currentSrv?: MembershipModel }[] = [];
        for (const person of persons) {
          // Current SCS membership (active, orgKey = SCS org, memberModelType = 'person')
          const currentScs = allMemberships.find(m => m.memberKey === person.okey && m.orgKey === 'scs' && m.state === 'active' && m.dateOfExit === END_FUTURE_DATE_STR);
          // SCS exit in last year
          const lastYearExit = allMemberships.find(m => m.memberKey === person.okey && m.orgKey === 'scs' && m.dateOfExit?.startsWith(lastYear.toString()));

          // Current SRV membership (active, orgKey = SRV org, memberModelType = 'person')
          const currentSrv = allMemberships.find(m => m.memberKey === person.okey && m.orgKey === 'srv' && m.state === 'active' && m.dateOfExit === END_FUTURE_DATE_STR);

          // we export a row for each person with a current SCS membership or an exit in the last year or a current SRV membership
          if (currentScs || currentSrv) {
            rows.push({ person, currentScs, lastYearExit, currentSrv });
          }
        }
        const dobByKey = await this.loadVaultDobs(rows.map(r => r.person.okey));
        for (const r of rows) {
          table.push(convertToSrvDataRow(r.person, this.getMemberContact(r.person.okey, dobByKey), r.currentScs, r.lastYearExit, r.currentSrv, postalByPersonKey.get(r.person.okey)));
        }
      },

      /**
       * Contact data of one member for exports (privacy 1.19 Phase 4): email/phone from the
       * address-directory projection, full dob from a preceding loadVaultDobs() batch.
       */
      getMemberContact(personKey: string, dobByKey?: Map<string, string>): MemberContact {
        const directory = store.appStore.getDirectoryEntry(`person.${personKey}`);
        return {
          email: directory?.favEmail ?? '',
          phone: directory?.favPhone ?? '',
          dateOfBirth: dobByKey?.get(personKey) ?? ''
        };
      },

      /**
       * Batch-loads the full dateOfBirth (StoreDate) per person key from the vault via the
       * getAddressView callable (memberAdmin tier, D-P4-1), chunked to the callable's
       * 50-key limit. Persons without a dob vault entry are missing from the map.
       */
      async loadVaultDobs(personKeys: string[]): Promise<Map<string, string>> {
        const dobByKey = new Map<string, string>();
        const keys = [...new Set(personKeys.filter(k => !!k))];
        for (let i = 0; i < keys.length; i += 50) {
          const chunk = keys.slice(i, i + 50).map(k => `person.${k}`);
          try {
            const result = await store.getAddressViewFn({ parentKeys: chunk });
            for (const [parentKey, addresses] of Object.entries(result.data.views ?? {})) {
              const dob = addresses.find(a => a.addressChannel === 'dob')?.dob;
              if (dob) dobByKey.set(parentKey.substring('person.'.length), dob);
            }
          } catch (error) {
            warn(`MembershipStore.loadVaultDobs: getAddressView failed for chunk ${i / 50}: ${error}`);
          }
        }
        return dobByKey;
      },

      async delete(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!membership || readOnly) return;
        const confirmMessage = store.orgType() === 'group' ? store.i18n.delete_group() : store.i18n.delete_confirm();
        const result = await confirm(store.alertController, confirmMessage, store.i18n.ok(), store.i18n.cancel(), true);
        if (result === true) {
          await store.membershipService.delete(membership);
          this.refreshData();  
        }
      },

      // persons, orgs, active, applied, passive, cancelled, deceased, entries, exits, all, memberships
      /** The memberships currently shown by the given list tab. */
      getFilteredMemberships(listId: string): MembershipModel[] {
        switch (listId) {
          case 'persons': return store.filteredPersons() ?? [];
          case 'orgs': return store.filteredOrgs() ?? [];
          case 'active': return store.filteredActive();
          case 'applied': return store.filteredApplied();
          case 'passive': return store.filteredPassive();
          case 'cancelled': return store.filteredCancelled();
          case 'deceased': return store.filteredDeceased();
          case 'entries': return store.filteredEntries();
          case 'exits': return store.filteredExits();
          case 'all':
          case 'memberships': return store.filteredMembers() ?? [];
          default: return [];
        }
      },

      async copyEmailAddresses(listId: string, readOnly = true): Promise<void> {
        const persons = store.appStore.allPersons();
        const memberKeySet = new Set(this.getFilteredMemberships(listId).map(m => m.memberKey));
        const filteredPersons = persons.filter(p => p.okey && memberKeySet.has(p.okey));

        const mainEmails = getMainEmailAddresses(filteredPersons, (p) => store.appStore.getDirectoryEntry(`person.${p.okey}`)?.favEmail);

        const ccQuery = getSystemQuery(store.tenantId());
        ccQuery.push({ key: 'addressChannel', operator: '==', value: 'email' });
        ccQuery.push({ key: 'isCc', operator: '==', value: true });
        const allCcAddresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, ccQuery, 'none');
        const ccEmails = getCcEmailAddresses(filteredPersons, allCcAddresses);

        const modal = await store.modalController.create({
          component: EmailAddressesModal,
          componentProps: { mainEmails, ccEmails, canChange: !readOnly }
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ memberKey: string; readOnly: boolean }>();
        if (role === 'navigate' && data?.memberKey) {
          const person = store.appStore.getPerson(data.memberKey);
          if (!person || !store.personEditModalClass) return;
          const personModal = await store.modalController.create({
            component: store.personEditModalClass,
            componentProps: {
              person,
              currentUser: store.currentUser(),
              tags: store.appStore.getTags(PersonModelName),
              tenantId: store.tenantId(),
              genders: store.genders(),
              readOnly: data.readOnly
            }
          });
          personModal.present();
          const { data: personData, role: personRole } = await personModal.onDidDismiss();
          if (personRole === 'confirm' && personData && !data.readOnly) {
            await store.personService.update(personData, store.currentUser());
          }
        }
      },

      /**
       * Bulk mail to the currently filtered members: first the distribution-list modal
       * (to/cc/bcc), then the email composer, which sends the mail in throttled blocks.
       */
      async sendEmailToList(listId: string): Promise<void> {
        const memberKeySet = new Set(this.getFilteredMemberships(listId).map(m => m.memberKey));
        const filteredPersons = store.appStore.allPersons().filter(p => p.okey && memberKeySet.has(p.okey));
        const recipients = getMainEmailAddresses(filteredPersons, (p) => store.appStore.getDirectoryEntry(`person.${p.okey}`)?.favEmail);
        await openBulkEmailFlow({
          modalController: store.modalController,
          firestoreService: store.firestoreService,
          appStore: store.appStore,
          tenantId: store.tenantId(),
        }, recipients);
      },

      async editPerson(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!membership) return;
        const person = store.appStore.getPerson(membership.memberKey);
        if (!person || !store.personEditModalClass) return;
        const modal = await store.modalController.create({
          component: store.personEditModalClass,
          componentProps: {
            person,
            currentUser: store.currentUser(),
            tags: store.appStore.getTags(PersonModelName),
            tenantId: store.tenantId(),
            genders: store.genders(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          await store.personService.update(data, store.currentUser());
        }
      },

      async copy(value: string, label?: string): Promise<void> {
        await copyToClipboardWithConfirmation(store.toastController, value ?? '', label);
      },

      async sendEmail(membership: MembershipModel): Promise<void> {
        const email = this.getEmail(membership);
        if (email) {
          return await browseUrl(`mailto:${email}`, '');
        }
      },

      async call(membership: MembershipModel): Promise<void> {
        const phone = this.getPhone(membership);
        if (phone) {
          return await browseUrl(`tel:${phone}`, '');
        }
      },

      async createInvoice(membership: MembershipModel): Promise<void> {
        const modal = await store.modalController.create({
          component: InvoiceNewModal,
          cssClass: 'wide-modal',
          componentProps: { 
            membership 
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ id: string }>();
        if (role === 'confirm' && data) {
          await showToast(store.toastController, `@finance.invoice.operation.create.conf`);
        }
      }
    }
  }),
);


@Injectable({
  providedIn: 'root'
})
export class MembershipStore extends _MembershipStore {
  constructor() {
    super();
  }
}