import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';

import { ExportFormats, memberTypeMatches, yearMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressModel, CategoryListModel, ExportFormat, GroupModel, MembershipCollection, MembershipModel, OrgModel, PersonModel, PersonModelName } from '@bk2/shared-models';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, generateRandomString, getSystemQuery, getTodayStr, isAfterDate, isAfterOrEqualDate, isMembership, nameMatches } from '@bk2/shared-util-core';
import { confirm, copyToClipboardWithConfirmation, exportXlsx, navigateByUrl } from '@bk2/shared-util-angular';
import { selectDate } from '@bk2/shared-ui';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';

import { getCatAbbreviation } from '@bk2/category-util';

import { MembershipService } from '@bk2/relationship-membership-data-access';
import { convertFormToNewPerson, convertMemberAndOrgToMembership, convertNewMemberFormToEmailAddress, convertNewMemberFormToMembership, convertNewMemberFormToPhoneAddress, convertNewMemberFormToPostalAddress, convertNewMemberFormToWebAddress, convertToAddressDataRow, convertToMemberDataRow, convertToRawDataRow, convertToSrvDataRow, getMemberEmailAddresses, getRelLogEntry, MemberNewFormModel } from '@bk2/relationship-membership-util';
import { AddressService } from '@bk2/subject-address-data-access';
import { PersonService } from '@bk2/subject-person-data-access';

// Modals are lazy loaded to avoid SSR hydration issues

export type MembershipState = {
  orgId: string;  // the organization to which the memberships belong (can be org or group)
  showOnlyCurrent: boolean;  // whether to show only current memberships or all memberships that ever existed

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
  showOnlyCurrent: true,
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
  })),

  withProps((store) => ({
    // all memberships of this tenant
    allMembershipsResource: rxResource({  
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.tenantId()), 'memberName2', 'asc').pipe(
          debugListLoaded('MembershipStore.allMemberships', params.currentUser)
        );
      },
    })
  })),

  withComputed((state) => {
    return {
      // all memberships, either only the current ones or all that ever existed (based on showOnlyCurrent)
      allMemberships: computed(() => state.showOnlyCurrent() ? 
        state.allMembershipsResource.value()?.filter(m => isAfterDate(m.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? [] : 
        state.allMembershipsResource.value()?.filter(m => m.relIsLast === true) ?? []),
      defaultMcat: computed(() => state.appStore.getCategory('mcat_default'))
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

      org: computed(() => state.appStore.getOrg(state.orgId()) ?? undefined),
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
      membershipCategoryKey: computed(() => state.org()?.membershipCategoryKey ?? 'mcat_default'),

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
      reload() {
        store.allMembershipsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setOrgId(orgId?: string) {
        if (!orgId) orgId = store.appStore.defaultOrg()?.bkey;
        console.log(`MembershipStore.setOrgId: ${orgId}`);
        // Only reset filters if orgId actually changed
        if (store.orgId() !== orgId) {
          patchState(store, { 
            orgId,
            searchTerm: '',
            selectedTag: '',
            selectedMembershipCategory: 'all',
            selectedGender: 'all',
            selectedOrgType: 'all'
          });
        }
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
        const module = await import('./member-new.modal');
        console.log('Loaded module:', module);
        const { MemberNewModal } = module;
        if (!MemberNewModal) {
          console.error('MemberNewModal is undefined in module:', module);
          throw new Error('MemberNewModal component not found');
        }
        const modal = await store.modalController.create({
          component: MemberNewModal,
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) {
          const newMember = data as MemberNewFormModel;
          if (store.personService.checkIfExists(store.appStore.allPersons(), newMember.firstName, newMember.lastName)) {
            if (!confirm(store.alertController, '@membership.operation.createMember.exists.error', true)) return;           
          }

          const personKey = await store.personService.create(convertFormToNewPerson(newMember, store.tenantId()), store.currentUser());
          const avatarKey = `person.${personKey}`;
          if ((newMember.email ?? '').length > 0) {
            this.saveAddress(convertNewMemberFormToEmailAddress(newMember, store.tenantId()), avatarKey);
          }
          if ((newMember.phone ?? '').length > 0) {
            this.saveAddress(convertNewMemberFormToPhoneAddress(newMember, store.tenantId()), avatarKey);
          }
          if ((newMember.web ?? '').length > 0) {
            this.saveAddress(convertNewMemberFormToWebAddress(newMember, store.tenantId()), avatarKey);
          }
          if ((newMember.city ?? '').length > 0) {
            this.saveAddress(convertNewMemberFormToPostalAddress(newMember, store.tenantId()), avatarKey);
          }
          if ((newMember.orgKey ?? '').length > 0 && (newMember.membershipCategory ?? '').length > 0) {
            await this.saveMembership(newMember, personKey);
          }
          this.reload();
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
        const membership = convertNewMemberFormToMembership(vm, personKey, store.tenantId());
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

        const { MembershipEditModalComponent } = await import('./membership-edit.modal');
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
            data.relLog = getRelLogEntry(data.order, '', data.dateOfEntry, mcatAbbreviation);
            await (!data.bkey ? 
              store.membershipService.create(data, store.currentUser()) : 
              store.membershipService.update(data, store.currentUser()));
          }
        }
        this.reload();
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
          endDate =  await selectDate(store.modalController, undefined, '@membership.operation.end.select', '@membership.operation.end.intro');
        }
        if (!endDate) return;
        const sDate = convertDateFormatToString(endDate.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate, false);
        await store.membershipService.endMembershipByDate(membership, sDate, store.currentUser());              
        this.reload();  
      },

      async changeMembershipCategory(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (readOnly || !membership) return;
        this.setOrgId(membership.orgKey);
        const membershipCategory = store.membershipCategory();
        if (membershipCategory) {
          const { CategoryChangeModalComponent } = await import('./membership-category-change.modal');
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
          }
          this.reload();
        }
      },

      async export(type: string, memberships: MembershipModel[]): Promise<void> {
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
        let tableName = 'Memberships';

        // prepare the header row
        switch(type) {
          case 'raw':
            // tbd: MembershipStore: header row with all membership fields
            table.push([
              'bkey',
              'tenants',
              'isArchived',
              'index',
              'tags',
              'notes',
              'memberKey',
              'memberName1',
              'memberName2',
              'memberModelType',
              'memberType',
              'memberNickName',
              'memberAbbreviation',
              'memberDateOfBirth',
              'memberDateOfDeath',
              'memberZipCode',
              'memberBexioId',
              'memberId',
              'orgKey',
              'orgName',
              'orgModelType',
              'dateOfEntry',
              'dateOfExit',
              'category',
              'state',
              'orgFunction',
              'order',
              'relLog',
              'relIsLast',
              'price'
            ]);
            tableName = 'Rohdaten Mitgliedschaften';
            break;
          case 'srv':
            table.push(['Clubname', 'MGRART_Titel', 'Beitrag', 'LastName', 'FirstName', 'SRVNR', 'Birthday', 'Street', 'Postcode', 'City', 'Mobile', 'Email', 'Funktion', 'Kommentar']);
            tableName = 'SRV Mitgliedschaften';
            break;
          case 'address':
            table.push(['Vorname', 'Name', 'Strasse', 'PLZ', 'Ort', 'Tel', 'E-Mail']);
            tableName = 'Adressliste';
            break;
          case 'member':
            table.push(['Mitgliedschafts-Nr', 'Vorname', 'Name', 'GebDatum', 'Eintrittsdatum', 'Kategorie', 'Funktion']);
            tableName = 'Mitglieder';
            break;
          default:
            console.error(`MembershipStore.export: unknown export type ${type}`);
            return;
        }
        if (type = 'srv') { // hardcoded and not considering any current membership filters. 
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
        } else {    // normal membership export for the currently filtered memberships
          for (const member of memberships) {
            const person = store.appStore.getPerson(member.memberKey);
            if (!person) continue;
            switch(type) {
              case 'raw':
                table.push(convertToRawDataRow(member));
                break;
              case 'srv': 
                break;
              case 'address':
                const addrRow = await convertToAddressDataRow(person);
                if (addrRow !== undefined) table.push(addrRow);
                break;
              case 'member':
                const memRow = await convertToMemberDataRow(member);
                if (memRow !== undefined) table.push(memRow);
                break;
            }
          }
        }
        exportXlsx(table, fn, tableName);
      },

      async delete(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!membership || readOnly) return;
        const result = await confirm(store.alertController, '@membership.operation.delete.confirm', true);
        if (result === true) {
          await store.membershipService.delete(membership);
          this.reload();  
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