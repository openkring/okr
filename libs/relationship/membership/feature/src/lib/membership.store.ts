import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';

import { memberTypeMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryCollection, CategoryListModel, GroupModel, MembershipCollection, MembershipModel, OrgModel, PersonModel, PersonModelName } from '@bk2/shared-models';
import { chipMatches, convertDateFormatToString, DateFormat, debugItemLoaded, debugListLoaded, getSystemQuery, getTodayStr, isAfterDate, isMembership, nameMatches } from '@bk2/shared-util-core';
import { confirm, copyToClipboardWithConfirmation, navigateByUrl } from '@bk2/shared-util-angular';
import { selectDate } from '@bk2/shared-ui';

import { getCategoryAbbreviation } from '@bk2/category-util';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { convertMemberAndOrgToMembership, getMemberEmailAddresses, getRelLogEntry } from '@bk2/relationship-membership-util';
import { MembershipEditModalComponent } from './membership-edit.modal';
import { CategoryChangeModalComponent } from './membership-category-change.modal';
import { of, switchMap } from 'rxjs';

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
    router: inject(Router)
  })),

  withProps((store) => ({
    // all memberships of this tenant
    allMembershipsResource: rxResource({  
      stream: () => {
        const allMemberships$ = store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.tenantId()), 'memberName2', 'asc');
        debugListLoaded('MembershipStore.allMemberships', allMemberships$, store.appStore.currentUser());
        return allMemberships$;
      },
    }),
    
    // default membership category - loaded once and reused as fallback
    defaultMcatResource: rxResource({
      stream: () => {
        const defaultMcat$ = store.firestoreService.readModel<CategoryListModel>(CategoryCollection, 'mcat_default');
        debugItemLoaded<CategoryListModel>('mcat_default', defaultMcat$, store.appStore.currentUser());
        return defaultMcat$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      // all memberships, either only the current ones or all that ever existed (based on showOnlyCurrent)
      allMemberships: computed(() => state.showOnlyCurrent() ? 
        state.allMembershipsResource.value()?.filter(m => isAfterDate(m.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? [] : 
        state.allMembershipsResource.value() ?? []),

      // members of a given org or group (if orgId is set), otherwise []
      members: computed(() => { 
        if (!state.orgId || state.orgId().length === 0) return [];
        return state.allMembershipsResource.value()?.filter((membership: MembershipModel) => membership.orgKey === state.orgId()) ?? []
      }),

      // memberships of the current member 
      memberships: computed(() => {
        if (!state.member() || !state.modelType) return [];
        return state.allMembershipsResource.value()?.filter((membership: MembershipModel) => 
          membership.memberKey === state.member()?.bkey && 
          membership.memberModelType === state.modelType()) ?? []
      }),

      org: computed(() => state.appStore.getOrg(state.orgId()) ?? undefined),
      membershipCategoryKey: computed(() => 'mcat_' + state.orgId()),
      currentUser: computed(() => state.appStore.currentUser()),
      genders: computed(() => state.appStore.getCategory('gender')),
      privacySettings: computed(() => state.appStore.privacySettings()),
      orgTypes: computed(() => state.appStore.getCategory('org_type')),
      tenantId: computed(() => state.appStore.tenantId()),
    };   
  }),

  withProps((store) => ({
    mcatResource: rxResource({
      params: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      stream: ({params}) => {
        return store.firestoreService.readModel<CategoryListModel>(CategoryCollection, params.mcatId).pipe(
          switchMap(mcat => {
            if (!mcat) {
              // fallback to preloaded default membership category
              console.log(`MembershipStore: mcat ${params.mcatId} not found, falling back to mcat_default`);
              const defaultMcat = store.defaultMcatResource.value();
              return of(defaultMcat);
            }
            debugItemLoaded<CategoryListModel>(`mcat ${params.mcatId}`, of(mcat), store.currentUser());
            return of(mcat);
          })
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      orgName: computed(() => state.org()?.name ?? ''),
      personMembers: computed(() => state.members().filter((membership: MembershipModel) =>
        membership.memberModelType === 'person') ?? []),

      orgMembers: computed(() => state.members().filter((membership: MembershipModel) =>
        membership.memberModelType === 'org') ?? []),

      appliedMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.membershipState === "applied") ?? []),

      activeMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.membershipState === "active") ?? []),

      passiveMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.membershipState === "passive") ?? []),

      cancelledMembers: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.relIsLast === true &&
        isAfterDate(getTodayStr(DateFormat.StoreDate), membership.dateOfExit) &&
        membership.membershipState === "cancelled") ?? []),

      deceasedMembers: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.memberDateOfDeath.length > 0) ?? []),

      entries: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.order === 1 && 
        isAfterDate(state.selectedYear() + '1231', membership.dateOfEntry)) ?? []),

      exits: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() &&
        membership.memberModelType === 'person' &&
        membership.relIsLast === true && 
        isAfterDate(state.selectedYear() + '1231', membership.dateOfExit)) ?? []),
    };
  }),

  withComputed((state) => {
    return {
      membershipCategory: computed(() => state.mcatResource.value() ?? undefined),
      defaultOrg: computed(() => state.org()),
      currentPerson : computed(() => state.appStore.currentPerson()),
      isLoading: computed(() => state.allMembershipsResource.isLoading()
        || state.mcatResource.isLoading()),

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
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
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
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
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
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // deceased members
      deceasedCount: computed(() => state.deceasedMembers().length), 
      filteredDeceased: computed(() => 
        state.deceasedMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // entries
      entriesCount: computed(() => state.entries().length), 
      filteredEntries: computed(() => 
        state.entries()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // entries
      exitsCount: computed(() => state.entries().length), 
      filteredExits: computed(() => 
        state.exits()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      )
    }
  }),

  withMethods((store) => {

    return {
      reload() {
        store.allMembershipsResource.reload();
        store.mcatResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setOrgId(orgId: string) {
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
        const member = store.appStore.currentPerson();
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
        const member = store.appStore.currentPerson();
        if (!member) { console.log('MembershipStore.addMemberToGroup: no member.'); return; }
        const membership = convertMemberAndOrgToMembership(member, group, store.tenantId(), PersonModelName);
        this.edit(membership, readOnly, true);
      },

      /**
       * Show a modal to edit an existing membership.
       * @param membership the membership to edit
       */
      async edit(membership?: MembershipModel, readOnly = true, isNew = false): Promise<void> {
        if (!membership) return;

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
            const mcatAbbreviation = getCategoryAbbreviation(store.membershipCategory(), data.membershipCategory);
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
          }
          this.reload();
        }
      },

      async export(type: string): Promise<void> {
        console.log(`MembershipListStore.export(${type}) is not yet implemented.`);
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