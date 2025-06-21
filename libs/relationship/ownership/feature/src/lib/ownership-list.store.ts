import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';

import { chipMatches, confirm, convertDateFormatToString, DateFormat, debugListLoaded, die, getTodayStr, isAfterDate, nameMatches } from '@bk2/shared/util';
import { AllCategories, GenderType, ModelType, OrgType, OwnershipModel, OwnershipType, OwnerTypeSelect, ResourceType, RowingBoatType } from '@bk2/shared/models';
import { categoryMatches, ownerTypeMatches } from '@bk2/shared/categories';
import { AppStore } from '@bk2/shared/feature';
import { selectDate } from '@bk2/shared/ui';

import { OwnershipService } from '@bk2/ownership/data-access';
import { OwnershipModalsService } from './ownership-modals.service';

export type OwnershipListState = {
  ownerKey: string;
  searchTerm: string;
  selectedTag: string;
  selectedOwnershipType: OwnershipType | typeof AllCategories;
  selectedResourceType: ResourceType | typeof AllCategories;
  selectedYear: number;
  selectedModelType: ModelType | typeof AllCategories;
  selectedGender: GenderType | typeof AllCategories;
  selectedOrgType: OrgType | typeof AllCategories;
  selectedRowingBoatType: RowingBoatType | typeof AllCategories;
  yearField: 'validFrom' | 'validTo';
};

const initialState: OwnershipListState = {
  ownerKey: '',
  searchTerm: '',
  selectedTag: '',
  selectedOwnershipType: AllCategories,
  selectedResourceType: AllCategories,
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedModelType: AllCategories,
  selectedGender: AllCategories,
  selectedOrgType: AllCategories,
  selectedRowingBoatType: AllCategories,
  yearField: 'validFrom',
};

export const OwnershipListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    ownershipService: inject(OwnershipService),
    ownershipModalsService: inject(OwnershipModalsService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController)     
  })),

  withProps((store) => ({
    ownershipsResource: rxResource({
      loader: () => {
        const ownerships$ = store.ownershipService.list();
        debugListLoaded('OwnershipListStore.ownerships', ownerships$, store.appStore.currentUser());
        return ownerships$;
      }
    })
  })),

  // list types
  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource: computed(() => state.appStore.defaultResource()),
      // all ownerships, no filters applied
      allOwnerships: computed(() => state.ownershipsResource.value() ?? []),
      isLoading: computed(() => state.ownershipsResource.isLoading()),

      // all ownerships of a given owner (person or org). This can be used e.g. in ownership-accordion
      ownerships: computed(() => state.ownershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.ownerKey === state.ownerKey()) ?? []),

      lockers: computed(() => state.ownershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === ModelType.Resource &&
        ownership.resourceType === ResourceType.Locker &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      keys: computed(() => state.ownershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === ModelType.Resource &&
        ownership.resourceType === ResourceType.Key &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      privateBoats: computed(() => state.ownershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === ModelType.Resource &&
        ownership.resourceType === ResourceType.RowingBoat &&
        ownership.ownerModelType === ModelType.Person &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),
  
      scsBoats: computed(() => state.ownershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === ModelType.Resource &&
        ownership.resourceType === ResourceType.RowingBoat &&
        ownership.ownerKey === 'scs' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? [])
    };
  }),

  // filters
  withComputed((state) => {
    return {
      // all ownerships
      allOwnershipsCount: computed(() => state.allOwnerships().length), 
      filteredAllOwnerships: computed(() => 
        state.allOwnerships().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          categoryMatches(ownership.resourceType ?? 0, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
      // ownerships of a given owner
      ownershipsCount: computed(() => state.ownerships().length),
      filteredOwnerships: computed(() => 
        state.ownerships().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          categoryMatches(ownership.resourceType ?? 0, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // lockers
      lockersCount: computed(() => state.lockers().length ?? 0), 
      filteredLockers: computed(() =>
        state.lockers().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          categoryMatches(ownership.resourceType ?? 0, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // keys
      keysCount: computed(() => state.keys().length ?? 0), 
      filteredKeys: computed(() => 
        state.keys()?.filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          categoryMatches(ownership.resourceType ?? 0, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // private boats
      privateBoatsCount: computed(() => state.privateBoats().length ?? 0), 
      filteredPrivateBoats: computed(() => 
        state.privateBoats()?.filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          categoryMatches(ownership.resourceType ?? 0, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
      
      // scs boats
      scsBoatsCount: computed(() => state.scsBoats().length ?? 0), 
      filteredScsBoats: computed(() => 
        state.scsBoats()?.filter((ownership: OwnershipModel) => 
        nameMatches(ownership.index, state.searchTerm()) &&
        chipMatches(ownership.tags, state.selectedTag()) &&
        categoryMatches(ownership.resourceSubType ?? 0, state.selectedRowingBoatType())
      )),
    }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.ownershipsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setOwnerKey(ownerKey: string) {
        patchState(store, { ownerKey });
      },

      setYearField(yearField: 'validFrom' | 'validTo') {
        patchState(store, { yearField });
      },
      
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedOwnershipType(selectedOwnershipType: OwnershipType | typeof AllCategories) {
        patchState(store, { selectedOwnershipType });
      },

      setSelectedResourceType(selectedResourceType: ResourceType | typeof AllCategories) {
        patchState(store, { selectedResourceType });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedGender(selectedGender: GenderType | typeof AllCategories) {
        patchState(store, { selectedGender, selectedModelType: ModelType.Person });
      },

      setSelectedOrgType(selectedOrgType: OrgType | typeof AllCategories) {
        patchState(store, { selectedOrgType, selectedModelType: ModelType.Org });
      },

      setSelectedRowingBoatType(selectedRowingBoatType: RowingBoatType | typeof AllCategories) {
        patchState(store, { selectedRowingBoatType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedOwnerType(ownerType: OwnerTypeSelect | typeof AllCategories) {
        switch(ownerType) {
          case OwnerTypeSelect.Persons: 
            patchState(store, { 
              selectedModelType: ModelType.Person,
              selectedGender: AllCategories,
            }); 
            break;
          case OwnerTypeSelect.Men:     
            patchState(store, { 
              selectedModelType: ModelType.Person,
              selectedGender: GenderType.Male,
            }); 
            break;
          case OwnerTypeSelect.Women:   
            patchState(store, { 
              selectedModelType: ModelType.Person,
              selectedGender: GenderType.Female,
            }); 
            break;
          case OwnerTypeSelect.Org:     
            patchState(store, {
              selectedModelType: ModelType.Org,
              selectedOrgType: AllCategories,
            }); 
            break;
          case AllCategories:
            patchState(store, {
              selectedModelType: AllCategories,
              selectedGender: AllCategories,
              selectedOrgType: AllCategories,
            });
            break;
          default:
            die('OwnershipListStore: unknown ownerType ' + ownerType);
        }
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Ownership);
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        const _currentPerson = store.appStore.currentPerson();
        const _defaultResource = store.appStore.defaultResource();
        if (!_currentPerson || !_defaultResource) return;
        await store.ownershipModalsService.add(_currentPerson, ModelType.Person, _defaultResource);
        store.ownershipsResource.reload();
      },

      async edit(ownership?: OwnershipModel): Promise<void> {
        await store.ownershipModalsService.edit(ownership);
        store.ownershipsResource.reload();
      },

      /**
       * End an existing Ownership.
       * We do not archive ownerships as we want to make them visible in the lists.
       * Therefore, we end an ownership by setting its validTo date.
       * @param ownership the Ownership to delete, its bkey needs to be valid so that we can find it in the database. 
       */
      async end(ownership: OwnershipModel): Promise<void> {
        if (ownership) {
          const _date = await selectDate(store.modalController);
          if (!_date) return;
          await store.ownershipService.endOwnershipByDate(ownership, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          store.ownershipsResource.reload();  
        }
      },   

      async export(type: string): Promise<void> {
        console.log(`OwnershipListStore.export(${type}) is not yet implemented.`);
      },

      async delete(ownership?: OwnershipModel): Promise<void> {
        if (ownership) {
          const _result = await confirm(store.alertController, '@ownership.operation.delete.confirm', true);
          if (_result === true) {
            await store.ownershipService.delete(ownership);
            store.ownershipsResource.reload(); 
          }
        }
      },
    }
  }),
);
