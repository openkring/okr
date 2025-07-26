import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { chipMatches, convertDateFormatToString, DateFormat, debugItemLoaded, debugListLoaded, getSystemQuery, getTodayStr, isAfterDate, nameMatches } from '@bk2/shared/util-core';
import { memberTypeMatches } from '@bk2/shared/categories';
import { AllCategories, CategoryCollection, CategoryListModel, GenderType, MembershipCollection, MembershipModel, ModelType, OrgCollection, OrgModel, OrgType, PersonCollection, PersonModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';
import { selectDate } from '@bk2/shared/ui';

import { MembershipService } from '@bk2/relationship/membership/data-access';
import { MembershipModalsService } from './membership-modals.service';
import { FirestoreService } from '@bk2/shared/data-access';

export type MembershipListState = {
  orgId: string;
  searchTerm: string;
  selectedTag: string;
  selectedMembershipCategory: string;
  selectedYear: number;
  selectedGender: GenderType | typeof AllCategories;
  selectedOrgType: OrgType | typeof AllCategories;
  yearField: 'dateOfEntry' | 'dateOfExit';
};

const initialState: MembershipListState = {
  orgId: '',
  searchTerm: '',
  selectedTag: '',
  selectedMembershipCategory: 'all',
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedGender: AllCategories,
  selectedOrgType: AllCategories,
  yearField: 'dateOfEntry',
};

export const MembershipListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    membershipModalsService: inject(MembershipModalsService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    membershipsResource: rxResource({
      stream: () => {
        const memberships$ = store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.tenantId()), 'memberName2', 'asc');
        debugListLoaded('memberships', memberships$, store.appStore.currentUser());
        return memberships$;
      }
    }),
    // load the default organization (which is the same id as the tenant)
    defaultOrgResource: rxResource({
      params: () => ({
        orgId: store.orgId()
      }),  
      stream: ({params}) => {
        const org$ = store.firestoreService.readModel<OrgModel>(OrgCollection, params.orgId);
        debugItemLoaded('defaultOrg', org$, store.appStore.currentUser());
        return org$;
      }
    })
  })),

  withComputed((state) => {
    return {
      memberships: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId()) ?? []),

      membershipCategoryKey: computed(() => 'mcat_' + state.orgId()),
      currentUser: computed(() => state.appStore.currentUser()),
      defaultOrgName: computed(() => state.defaultOrgResource.value()?.name ?? ''),

      // membership.list.header: avatar / name / entryExit (relLog | duration) / memberHeader (relLog | memberCategories)
      persons: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() && 
        membership.memberModelType === ModelType.Person &&
        isAfterDate(membership.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? []),

      orgs: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() && 
        membership.memberModelType === ModelType.Org &&
        isAfterDate(membership.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? []),

      applied: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === ModelType.Person &&
        membership.membershipState === "applied" && 
        isAfterDate(membership.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? []),

      // membership.list.header: avatar / name / entryExit (relLog | duration) / memberHeader (relLog | memberCategories)
      active: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === ModelType.Person &&
        membership.membershipState === "active" && 
        isAfterDate(membership.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? []),

      passive: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === ModelType.Person &&
        membership.membershipState === "passive" && 
        isAfterDate(membership.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? []),

      cancelled: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === ModelType.Person &&
        membership.relIsLast === true &&
        isAfterDate(getTodayStr(DateFormat.StoreDate), membership.dateOfExit) &&
        membership.membershipState === "cancelled") ?? []),

      // state = cancelled, dateOfExit < today
      deceased: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === ModelType.Person &&
        membership.memberDateOfDeath.length > 0) ?? []),

      entries: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() && 
        membership.memberModelType === ModelType.Person &&
        membership.priority === 1 && 
        isAfterDate(state.selectedYear() + '1231', membership.dateOfEntry)) ?? []),

      exits: computed(() => state.membershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() &&
        membership.memberModelType === ModelType.Person &&
        membership.relIsLast === true && 
        isAfterDate(state.selectedYear() + '1231', membership.dateOfExit)) ?? []),
    };
  }),
  withProps((store) => ({
    mcatResource: rxResource({
      params: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      stream: ({params}) => {
        return store.firestoreService.readModel<CategoryListModel>(CategoryCollection, params.mcatId);            
      }
    }),
    currentPersonResource: rxResource({
      params: () => ({
        currentUser: store.currentUser()
      }),  
      stream: ({params}) => {
        if (params.currentUser) {
          return store.firestoreService.readModel<PersonModel>(PersonCollection, params.currentUser.personKey);
        }
        return of(undefined);
      }
    })
  })),
  withComputed((state) => {
    return {
      membershipCategory: computed(() => state.mcatResource.value() ?? undefined),
      defaultOrg: computed(() => state.defaultOrgResource.value()),
      currentPerson: computed(() => state.currentPersonResource.value()),
      isLoading: computed(() => state.membershipsResource.isLoading() || state.defaultOrgResource.isLoading()
        || state.mcatResource.isLoading() || state.currentPersonResource.isLoading()),

      // all memberships (= orgs and persons)
      membershipsCount: computed(() => state.membershipsResource.value()?.length ?? 0), 
      filteredMemberships: computed(() => 
        state.membershipsResource.value()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // all persons
      personsCount: computed(() => state.persons().length ?? 0), 
      filteredPersons: computed(() => {
        return state.persons()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      }
      ),

      // all orgs
      orgsCount: computed(() => state.orgs().length ?? 0), 
      filteredOrgs: computed(() => 
        state.orgs()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedOrgType()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // applied memberships
      appliedCount: computed(() => state.applied().length ?? 0), 
      filteredApplied: computed(() => 
        state.applied()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // active memberships
      activeCount: computed(() => state.active().length ?? 0), 
      filteredActive: computed(() => 
        state.active()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // passive memberships
      passiveCount: computed(() => state.passive().length ?? 0), 
      filteredPassive: computed(() => 
        state.passive()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // cancelled memberships
      cancelledCount: computed(() => state.cancelled().length ?? 0), 
      filteredCancelled: computed(() => 
        state.cancelled()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // deceased members
      deceasedCount: computed(() => state.deceased().length ?? 0), 
      filteredDeceased: computed(() => 
        state.deceased()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // entries
      entriesCount: computed(() => state.entries().length ?? 0), 
      filteredEntries: computed(() => 
        state.entries()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.membershipCategory, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // entries
      exitsCount: computed(() => state.entries().length ?? 0), 
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
      /******************************** setters (filter) ******************************************* */
      setOrgId(orgId: string) {
        patchState(store, { orgId });
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

      setSelectedGender(selectedGender: GenderType | typeof AllCategories) {
        patchState(store, { selectedGender });
      },

      setSelectedOrgType(selectedOrgType: OrgType | typeof AllCategories) {
        patchState(store, { selectedOrgType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Membership);
      },
 
      /******************************** actions ******************************************* */
      async add(): Promise<void> {
        await store.membershipModalsService.add(store.currentPerson(), store.defaultOrg(), ModelType.Person);
        store.membershipsResource.reload();
      },

      async edit(membership?: MembershipModel): Promise<void> {
        await store.membershipModalsService.edit(membership);
        store.membershipsResource.reload();
      },

      async changeMembershipCategory(membership?: MembershipModel): Promise<void> {
        if(membership) {
          const _mcat = store.membershipCategory();
          if (_mcat) {
            await store.membershipModalsService.changeMembershipCategory(membership, _mcat);
            store.membershipsResource.reload();
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`MembershipListStore.export(${type}) is not yet implemented.`);
      },

      async end(membership?: MembershipModel): Promise<void> {
        if (membership) {
          const _date = await selectDate(store.modalController);
          if (!_date) return;
          await store.membershipService.endMembershipByDate(membership, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          store.membershipsResource.reload();  
        }
      },

      async delete(membership?: MembershipModel): Promise<void> {
        if (membership) {
          await store.membershipService.delete(membership);
          store.membershipsResource.reload();  
        }
      },

      async copyEmailAddresses(): Promise<void> {
        await store.membershipService.copyAllEmailAddresses(of(store.memberships()));
      },
    }
  }),
);
