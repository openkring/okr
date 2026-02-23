import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { ExportFormats, memberTypeMatches, yearMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressModel, CategoryListModel, ExportFormat, GroupModel, MembershipCollection, MembershipModel, OrgModel, OwnershipCollection, OwnershipModel, PersonModel, PersonModelName, TaskModel } from '@bk2/shared-models';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, debugMessage, generateRandomString, getAvatarInfo, getCatAbbreviation, getDataRow, getFullName, getSystemQuery, getTodayStr, isAfterDate, isAfterOrEqualDate, isMembership, nameMatches, warn } from '@bk2/shared-util-core';
import { confirm, copyToClipboardWithConfirmation, exportXlsx, navigateByUrl } from '@bk2/shared-util-angular';
import { selectDate } from '@bk2/shared-ui';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';

import { TaskService } from '@bk2/task-data-access';
import { OwnershipService } from '@bk2/relationship-ownership-data-access';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { convertFormToNewPerson, convertMemberAndOrgToMembership, convertNewMemberFormToEmailAddress, convertNewMemberFormToMembership, convertNewMemberFormToPhoneAddress, convertNewMemberFormToPostalAddress, convertNewMemberFormToWebAddress, convertToClubdeskImportRow, convertToSrvDataRow, getGroupsOfMember, getMemberEmailAddresses, getRelLogEntry, MemberNewFormModel } from '@bk2/relationship-membership-util';
import { AddressService } from '@bk2/subject-address-data-access';
import { PersonService } from '@bk2/subject-person-data-access';
import { browseUrl } from '@bk2/subject-address-util';

import { MemberNewModal } from './member-new.modal';
import { MembershipEditModalComponent } from './membership-edit.modal';
import { CategoryChangeModalComponent } from './membership-category-change.modal';

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
    taskService: inject(TaskService),
    ownershipService: inject(OwnershipService)
  })),

  withProps((store) => ({
    // all memberships of this tenant
    allMembershipsResource: rxResource({  
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version()
      }),
      stream: ({params}) => {
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
            { key: 'ownerKey', operator: '==', value: params.member.bkey },
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
      defaultMcat: computed(() => state.appStore.getCategory('mcat_default')),
      ownershipsOfMember: computed(() => state.ownershipsOfMemberResource.value() ?? []),
    };
  }),

  withComputed((state) => {
    return {
      // members of a given org or group (if orgId is set), otherwise []
      members: computed(() => { 
        return state.allMemberships()?.filter((membership: MembershipModel) => membership.orgKey === state.orgId()) ?? []
      }),

      // memberships of the current member 
      memberships: computed(() => {
        if (!state.member() || !state.modelType) return [];
        return state.allMemberships()?.filter((membership: MembershipModel) => 
          membership.memberKey === state.member()?.bkey && 
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
      groupsOfMember: computed(() => getGroupsOfMember(state.memberships(), state.member()?.bkey) ?? []),

      membershipCategoryKey: computed(() => {
        if (state.orgType() === 'group') return undefined;
        const org = state.org() as OrgModel | undefined;
        return org?.membershipCategoryKey ?? 'mcat_default';
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
        membership.memberDateOfDeath.length > 0) ?? []),

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
      membershipCategory: computed<CategoryListModel>(() => state.appStore.getCategory(state.membershipCategoryKey()) ?? state.defaultMcat()),
      groupsCount: computed(() => state.groupsOfMember().length),
      defaultOrg: computed(() => state.org()),
      currentPerson : computed(() => state.appStore.currentPerson()),
      
      isLoading: computed(() => 
        state.allMembershipsResource.isLoading() || 
        state.appStore.orgsResource.isLoading()
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
      filteredDeceased: computed(() => 
        state.deceasedMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          yearMatches(membership.memberDateOfDeath, state.selectedYear()) &&
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
        if (!orgId) orgId = store.appStore.defaultOrg()?.bkey;
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

      getEmail(membership: MembershipModel): string | undefined {
        const person = store.appStore.getPerson(membership.memberKey);
        if (person) {
          return person.favEmail;
        }
      },

      getPhone(membership: MembershipModel): string | undefined {
        const person = store.appStore.getPerson(membership.memberKey);
        if (person) {
          return person.favPhone;
        }
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
        this.setOrgId(org.bkey);
        const membership = convertMemberAndOrgToMembership(member, org, store.tenantId(), PersonModelName);
        this.edit(membership, readOnly, true);
      },

      /**
       * Add a person to a given group as a member.
       * We propose the current person as member. User can change this to another person in the edit modal.
       * The group stays fix.
       * @param group 
       * @param readOnly 
       * @returns 
       */
      async addMemberToGroup(group: GroupModel, readOnly = true): Promise<void> {
        if (readOnly) { console.log('MembershipStore.addMemberToGroup: readOnly mode.'); return; }
        const member = store.member() ?? store.appStore.currentPerson();
        if (!member) { console.log('MembershipStore.addMemberToGroup: no member.'); return; }
        const membership = convertMemberAndOrgToMembership(member, group, store.tenantId(), PersonModelName);
        this.edit(membership, readOnly, true);
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
          if (store.personService.checkIfExists(store.appStore.allPersons(), newMember.firstName, newMember.lastName)) {
            if (!confirm(store.alertController, '@membership.operation.createMember.exists.error', true)) return;           
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
        return await store.firestoreService.createModel<MembershipModel>(MembershipCollection, membership, '@membership.operation.create', store.appStore.currentUser());
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
        this.setOrgId(membership.orgKey);

        const modal = await store.modalController.create({
          component: MembershipEditModalComponent,
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
            if (!data.bkey) { // create new membership
              store.membershipService.create(data, store.currentUser());
              const memberName = getFullName(membership.memberName1, membership.memberName2);
              await this.addTask(membership, store.appStore.getGroup('treasurer'),
                `Neumitglied ${memberName} -> bitte Gebühren prüfen.`);
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
         * @param membership the membership to delete
         */
      async end(membership: MembershipModel, endDate?: string, readOnly = true): Promise<void> {
        if (!membership || readOnly) return;
        if (!endDate) {
          endDate =  await selectDate(store.modalController, getTodayStr(DateFormat.IsoDate), '@membership.operation.end.select', '@membership.operation.end.intro');
        }
        if (!endDate) { 
          warn('MembershipStore.end: no end date selected, cannot end membership');
          return;
        }
        const sDate = convertDateFormatToString(endDate.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate, false);
        await store.membershipService.endMembershipByDate(membership, sDate, store.currentUser());
        const memberName = getFullName(membership.memberName1, membership.memberName2);
        const ownerships = store.ownershipsOfMember();
        if (ownerships.length > 0) {
          await this.addTask(membership, store.appStore.getGroup('resourceAdmin'), `${memberName} ist ausgetreten -> bitte Schlüssel und/oder Chäschtli prüfen.`);
        } else {
          debugMessage('MembershipStore.end: no ownerships found for member, no task needed for resourceAdmin', store.currentUser());
        }
        await this.addTask(membership, store.appStore.getGroup('treasurer'), `${memberName} ist ausgetreten -> bitte Gebühren prüfen.`);
      },

      /**
       * Adds a new task to a group membership. 
       * The task is assigned to the group and the author is the current user. 
       * The task is initially assigned to the mainContact of the group resourceAdmin.
       * If the mainContact does not exist, the author is assigned, but can be changed in the task edit modal.
       * This is currently only implemented for memberships in Seeclub Stäfa (bkey = 'scs').
       * @param membership the membership for which to create the task. We need the membership to get the group (org) for which the task is created and to check if it is a SCS membership.
       * @param group the group to which the task is assigned.
       * @param name the name of the task to create. It should contain all relevant information about the reason for creating the task, so that the responsible person can directly act on it without having to look up additional information.
       * @returns 
       */
      async addTask(membership: MembershipModel, group?: GroupModel, name?: string): Promise<void> {
        await store.taskService.addTaskFromGroupMembership(membership, group, name, store.currentUser());
      },

      async changeMembershipCategory(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (readOnly || !membership) return;
        this.setOrgId(membership.orgKey);
        const membershipCategory = store.membershipCategory();
        if (membershipCategory) {
          const modal = await store.modalController.create({
            component: CategoryChangeModalComponent,
            componentProps: {
              membership,
              membershipCategory,
              currentUser: store.currentUser()
            }
          });
          modal.present();
          const { data, role } = await modal.onDidDismiss();
          if (role === 'confirm' && data !== undefined) {   // result is vm: CategoryChangeFormModel
            await store.membershipService.saveMembershipCategoryChange(membership, data, membershipCategory, store.currentUser());
            if (data.membershipCategoryNew === 'passive') {
              const memberName = getFullName(membership.memberName1, membership.memberName2);
              const ownerships = store.ownershipsOfMember();
              if (ownerships.length > 0) {
                await this.addTask(membership, store.appStore.getGroup('resourceAdmin'), `${memberName} wechselt auf Passiv. Bitte Schlüssel und/oder Chäschtli prüfen.`);
              } else {
                debugMessage('MembershipStore.changeMembershipCategory: no ownerships found for member, no task needed for resourceAdmin', store.currentUser());
              }
              await this.addTask(membership, store.appStore.getGroup('treasurer'), `${memberName} wechselt auf Passiv. Bitte Gebühren prüfen.`);
            }
          }
          this.refreshData();
        }
      },

      async export(type: string, memberships: MembershipModel[]): Promise<void> {
        let keys: (keyof MembershipModel)[] = [];
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
        let tableName = '';

        switch(type) {
          case 'raw':
            keys = Object.keys(new MembershipModel(store.appStore.tenantId())) as (keyof MembershipModel)[];
            table.push(keys);
            tableName = 'Rohdaten Mitgliedschaften';
            break;
          case 'srv':
            table.push(['Clubname', 'MGRART_Titel', 'Beitrag', 'LastName', 'FirstName', 'SrvId', 'Birthday', 'Street', 'Postcode', 'City', 'Mobile', 'Email', 'Funktion', 'Kommentar']);
            this.exportSrv(table);
            exportXlsx(table, fn, 'SRV Mitgliedschaften');
            return;
          case 'address':
            const pkeys = ['firstName', 'lastName', 'favStreetName', 'favStreetNumber', 'favZipCode', 'favCity', 'favPhone', 'favEmail'] as (keyof PersonModel)[];
            table.push(['Vorname', 'Name', 'Strassenname', 'Hausnummer', 'PLZ', 'Ort', 'Tel', 'E-Mail']);
            for (const member of memberships) {
              const person = store.appStore.getPerson(member.memberKey);
              if (!person) continue;
              table.push(getDataRow<PersonModel>(person, pkeys));
            }
            exportXlsx(table, fn, 'Adressliste');
            return;
          case 'clubdesk': 
            table.push(['Vorname', 'Nachname', 'Geschlecht', 'Anrede', 'Adresse', 'Ort', 'PLZ', 'Land', 'E-Mail', 'Telefon', 'Geburtsdatum', 'Eintritt', 'BexioId', 'Kategorie', 'Status', 'Funktion', 'RelLog']);
            for (const member of memberships) {
              const person = store.appStore.getPerson(member.memberKey);
              if (!person) continue;
              table.push(convertToClubdeskImportRow(member, person));
            }
            exportXlsx(table, fn, 'Clubdesk Import');
            return;
          case 'member':
            keys = ['memberId', 'memberName1', 'memberName2', 'memberDateOfBirth', 'dateOfEntry', 'memberCategory', 'orgFunction'] as (keyof MembershipModel)[];
            table.push(['Mitgliedschafts-Nr', 'Vorname', 'Name', 'GebDatum', 'Eintrittsdatum', 'Kategorie', 'Funktion']);
            tableName = 'Mitglieder';
            break;
          default:
            console.error(`MembershipStore.export: unknown export type ${type}`);
            return;
        }
        for (const member of memberships) {
          table.push(getDataRow<MembershipModel>(member, keys));
        }
        exportXlsx(table, fn, tableName);
      },

      exportSrv(table: string[][]): void {
        // hardcoded and not considering any current membership filters. 
        // That's why it can be used from any membership (SCS, SRV, other).
        // Get all persons
        const persons = store.appStore.allPersons();
        // Get all memberships (stateless)
        const allMemberships = store.allMembershipsResource.value() ?? [];
        for (const person of persons) {
          // Current SCS membership (active, orgKey = SCS org, memberModelType = 'person')
          const currentScs = allMemberships.find(m => m.memberKey === person.bkey && m.orgKey === 'scs' && m.state === 'active' && m.dateOfExit === END_FUTURE_DATE_STR);
          // SCS exit in last year
          const lastYear = (new Date()).getFullYear() - 1;
          const lastYearExit = allMemberships.find(m => m.memberKey === person.bkey && m.orgKey === 'scs' && m.dateOfExit?.startsWith(lastYear.toString()));

          // Current SRV membership (active, orgKey = SRV org, memberModelType = 'person')
          const currentSrv = allMemberships.find(m => m.memberKey === person.bkey && m.orgKey === 'srv' && m.state === 'active' && m.dateOfExit === END_FUTURE_DATE_STR);

          // we export a row for each person with a current SCS membership or an exit in the last year or a current SRV membership
          if (currentScs || currentSrv) {
            table.push(convertToSrvDataRow(person, currentScs, lastYearExit, currentSrv));
          }
        }
      },

      async delete(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!membership || readOnly) return;
        const result = await confirm(store.alertController, '@membership.operation.delete.confirm', true);
        if (result === true) {
          await store.membershipService.delete(membership);
          this.refreshData();  
        }
      },

      async copyEmailAddresses(listId: string, readOnly = true): Promise<void> {
        if (!readOnly) {
          const persons = store.appStore.allPersons();
          let emails: string[] = [];
          switch (listId) {
            case 'persons': emails = await getMemberEmailAddresses(store.filteredPersons(), persons); break;
            case 'orgs': emails = await getMemberEmailAddresses(store.filteredOrgs(), persons); break;
            case 'active': emails = await getMemberEmailAddresses(store.filteredActive(), persons); break;
            case 'applied': emails = await getMemberEmailAddresses(store.filteredApplied(), persons); break;
            case 'passive': emails = await getMemberEmailAddresses(store.filteredPassive(), persons); break;
            case 'cancelled': emails = await getMemberEmailAddresses(store.filteredCancelled(), persons); break;
            case 'deceased': emails = await getMemberEmailAddresses(store.filteredDeceased(), persons); break;
            case 'entries': emails = await getMemberEmailAddresses(store.filteredEntries(), persons); break;
            case 'exits': emails = await getMemberEmailAddresses(store.filteredExits(), persons); break;
            case 'all':
            case 'memberships': emails = await getMemberEmailAddresses(store.filteredMembers() ?? [], persons); break;
          }
          if (emails.length > 0) {
            await copyToClipboardWithConfirmation(store.toastController, emails.toString(), '@subject.address.operation.emailCopy.conf');
          }
        }
      },

      async editPerson(membership?: MembershipModel, url?: string, readOnly = true): Promise<void> {
        if (!membership) return; // we pass readonly to the edit form
        if (url) {
          store.appStore.appNavigationService.pushLink(url);
        }
        await navigateByUrl(store.router, `/person/${membership.memberKey}`, { readOnly });
      },

      async copy(value: string, label: string): Promise<void> {
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