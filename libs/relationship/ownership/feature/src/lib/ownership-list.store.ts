import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ownerTypeMatches } from '@bk2/shared-categories';
import { AppStore } from '@bk2/shared-feature';
import { OwnershipModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { confirm } from '@bk2/shared-util-angular';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, getTodayStr, isAfterDate, nameMatches } from '@bk2/shared-util-core';

import { OwnershipService } from '@bk2/relationship-ownership-data-access';
import { OwnershipModalsService } from './ownership-modals.service';
import { DEFAULT_RBOAT_TYPE, DEFAULT_RESOURCE_TYPE } from '@bk2/shared-constants';
import { read } from 'fs';

export type OwnershipListState = {
  ownerKey: string;
  searchTerm: string;
  selectedTag: string;
  selectedOwnershipType: string;
  selectedResourceType: string;
  selectedYear: number;
  selectedModelType: 'person' | 'org' | 'all';
  selectedGender: string;
  selectedOrgType: string;
  selectedRowingBoatType: string;
  yearField: 'validFrom' | 'validTo';
};

const initialState: OwnershipListState = {
  ownerKey: '',
  searchTerm: '',
  selectedTag: '',
  selectedOwnershipType: 'all',
  selectedResourceType: 'all',
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedModelType: 'all',
  selectedGender: 'all',
  selectedOrgType: 'all',
  selectedRowingBoatType: 'all',
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
      stream: () => {
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
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'locker' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      keys: computed(() => state.ownershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'key' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      privateBoats: computed(() => state.ownershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'rboat' &&
        ownership.ownerModelType === 'person' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),
  
      scsBoats: computed(() => state.ownershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'rboat' &&
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
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
      // ownerships of a given owner
      ownershipsCount: computed(() => state.ownerships().length),
      filteredOwnerships: computed(() => 
        state.ownerships().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // lockers
      lockersCount: computed(() => state.lockers().length ?? 0), 
      filteredLockers: computed(() =>
        state.lockers().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // keys
      keysCount: computed(() => state.keys().length ?? 0), 
      filteredKeys: computed(() => 
        state.keys()?.filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),

      // private boats
      privateBoatsCount: computed(() => state.privateBoats().length ?? 0), 
      filteredPrivateBoats: computed(() => 
        state.privateBoats()?.filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
      
      // scs boats
      scsBoatsCount: computed(() => state.scsBoats().length ?? 0), 
      filteredScsBoats: computed(() => 
        state.scsBoats()?.filter((ownership: OwnershipModel) => 
        nameMatches(ownership.index, state.searchTerm()) &&
        chipMatches(ownership.tags, state.selectedTag()) &&
        nameMatches(ownership.resourceSubType ?? DEFAULT_RBOAT_TYPE, state.selectedRowingBoatType())
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

      setSelectedOwnershipType(selectedOwnershipType: string) {
        patchState(store, { selectedOwnershipType });
      },

      setSelectedResourceType(selectedResourceType: string) {
        patchState(store, { selectedResourceType });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedGender(selectedGender: string) {
        patchState(store, { selectedGender, selectedModelType: 'person' });
      },

      setSelectedOrgType(selectedOrgType: string) {
        patchState(store, { selectedOrgType, selectedModelType: 'org' });
      },

      setSelectedRowingBoatType(selectedRowingBoatType: string) {
        patchState(store, { selectedRowingBoatType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedOwnerType(ownerType: string) {
        switch(ownerType) {
          case 'persons': 
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'all',
            }); 
            break;
          case 'men':     
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'male',
            }); 
            break;
          case 'women':   
            patchState(store, { 
              selectedModelType: 'person',
              selectedGender: 'female',
            }); 
            break;
          case 'orgs':     
            patchState(store, {
              selectedModelType: 'org',
              selectedOrgType: 'all',
            }); 
            break;
          case 'all':
            patchState(store, {
              selectedModelType: 'all',
              selectedGender: 'all',
              selectedOrgType: 'all',
            });
            break;
          default:
            die('OwnershipListStore: unknown ownerType ' + ownerType);
        }
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('ownership');
      },

      /******************************* actions *************************************** */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const currentPerson = store.appStore.currentPerson();
        const defaultResource = store.appStore.defaultResource();
        if (!currentPerson || !defaultResource) return;
        await store.ownershipModalsService.add(currentPerson, 'person', defaultResource);
        store.ownershipsResource.reload();
      },

      async edit(ownership?: OwnershipModel, readOnly = true): Promise<void> {
        if (!readOnly && ownership) {
          await store.ownershipModalsService.edit(ownership);
          store.ownershipsResource.reload();
        }
      },

      /**
       * End an existing Ownership.
       * We do not archive ownerships as we want to make them visible in the lists.
       * Therefore, we end an ownership by setting its validTo date.
       * @param ownership the Ownership to delete, its bkey needs to be valid so that we can find it in the database. 
       */
      async end(ownership: OwnershipModel, readOnly = true): Promise<void> {
        if (!readOnly && ownership) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          await store.ownershipService.endOwnershipByDate(ownership, convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          store.ownershipsResource.reload();  
        }
      },   

      async export(type: string): Promise<void> {
        console.log(`OwnershipListStore.export(${type}) is not yet implemented.`);
      },

      async delete(ownership?: OwnershipModel, readOnly = true): Promise<void> {
        if (!readOnly && ownership) {
          const result = await confirm(store.alertController, '@ownership.operation.delete.confirm', true);
          if (result === true) {
            await store.ownershipService.delete(ownership);
            store.ownershipsResource.reload(); 
          }
        }
      },
    }
  }),
);
