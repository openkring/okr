import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ownerTypeMatches } from '@bk2/shared-categories';
import { AppStore } from '@bk2/shared-feature';
import { OrgModel, OwnershipModel, PersonModel, PersonModelName, ResourceModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { confirm } from '@bk2/shared-util-angular';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, getTodayStr, isAfterDate, isOwnership, nameMatches } from '@bk2/shared-util-core';
import { DEFAULT_RBOAT_TYPE, DEFAULT_RESOURCE_TYPE } from '@bk2/shared-constants';

import { OwnershipService } from '@bk2/relationship-ownership-data-access';
import { newOwnership } from '@bk2/relationship-ownership-util';
import { OwnershipEditModalComponent } from './ownership-edit.modal';
import { OwnershipNewModalComponent } from './ownership-new.modal';

export type OwnershipState = {
  // accordion state
  ownerModelType: 'person' | 'org';
  ownerKey: string;
  showOnlyCurrent: boolean;
  resourceKey: string;

  // filters
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

const initialState: OwnershipState = {
  ownerKey: '',
  showOnlyCurrent: false,
  ownerModelType: 'person',
  resourceKey: '',

  // filters
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

export const OwnershipStore = signalStore(
  withState(initialState),
  withProps(() => ({
    ownershipService: inject(OwnershipService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController)     
  })),

  withProps((store) => ({
    // all ownerships of this tenant
    allOwnershipsResource: rxResource({
      stream: () => {
        return store.ownershipService.list().pipe(
          debugListLoaded('OwnershipStore.allOwnerships', store.appStore.currentUser())
        );
      }
    })
  })),

  // list types
  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource: computed(() => state.appStore.defaultResource()),
      tenantId: computed(() => state.appStore.tenantId()),

      // all ownerships, either only the current ones or all that ever existed (based on showOnlyCurrent)
      allOwnerships: computed(() => state.showOnlyCurrent() ? 
        state.allOwnershipsResource.value()?.filter(m => isAfterDate(m.validTo, getTodayStr(DateFormat.StoreDate))) ?? [] : 
        state.allOwnershipsResource.value() ?? []),

      isLoading: computed(() => state.allOwnershipsResource.isLoading()),

      // all ownerships of a given owner (person or org). This can be used e.g. in ownership-accordion
      ownerships: computed(() => {
        if (!state.ownerKey() || state.ownerKey().length === 0) return [];
        if (!state.ownerModelType()) return [];
        return state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.ownerKey === state.ownerKey()) ?? []
      }),

      // all owners of a given resource
      owners: computed(() => {
        if (!state.ownerKey() || state.ownerKey().length === 0) return [];
        return Array.from(new Set(state.allOwnershipsResource.value()
          ?.filter((ownership: OwnershipModel) => ownership.resourceKey === state.ownerKey())
          .map((ownership: OwnershipModel) => ownership.ownerKey)));
      }),

      lockers: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'locker' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      keys: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'key' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),

      privateBoats: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
        ownership.resourceModelType === 'resource' &&
        ownership.resourceType === 'rboat' &&
        ownership.ownerModelType === 'person' &&
        isAfterDate(ownership.validTo, getTodayStr(DateFormat.StoreDate))) ?? []),
  
      scsBoats: computed(() => state.allOwnershipsResource.value()?.filter((ownership: OwnershipModel) =>
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
      ownershipsCount: computed(() => state.ownerships().length),
      filteredAllOwnerships: computed(() => 
        state.allOwnerships().filter((ownership: OwnershipModel) => 
          nameMatches(ownership.index, state.searchTerm()) &&
          chipMatches(ownership.tags, state.selectedTag()) &&
          nameMatches(ownership.resourceType ?? DEFAULT_RESOURCE_TYPE, state.selectedResourceType()) &&
          ownerTypeMatches(ownership, state.selectedModelType(), state.selectedGender(), state.selectedOrgType()))
      ),
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
      },
      reload() {
        store.allOwnershipsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setOwnerKey(ownerKey: string) {
        patchState(store, { ownerKey });
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
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

      setOwner(ownerKey: string, ownerModelType: 'person' | 'org'): void {
        patchState(store, { ownerKey, ownerModelType });
        this.reload();
      },  

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('ownership');
      },

      /******************************* actions *************************************** */
      /**
       * Show a modal to add a new Ownership.
       * @param readOnly 
       * @returns 
       */
      async add(givenOwner?: PersonModel | OrgModel, ownerModelType: 'person' | 'org' = 'person', givenResource?: ResourceModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const owner = givenOwner ?? store.appStore.currentPerson();
        const resource = givenResource ?? store.appStore.defaultResource();
        console.log('OwnershipStore.add: owner=', owner, ' resource=', resource);
        if (!owner || !resource) return;
        const ownership = newOwnership(owner, resource, store.tenantId(), ownerModelType);
        const modal = await store.modalController.create({
          component: OwnershipNewModalComponent,
          cssClass: 'small-modal',
          componentProps: {
            ownership,
            currentUser: store.appStore.currentUser()
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isOwnership(data, store.tenantId())) {
            await store.ownershipService.create(data, store.currentUser());
          }
        }
        this.reload();
      },

      /**
       * Show a modal to edit an existing Ownership.
       * @param ownership the Ownership to edit
       * @param readOnly 
       */
      async edit(ownership: OwnershipModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: OwnershipEditModalComponent,
          componentProps: {
            ownership,
            currentUser: store.currentUser(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isOwnership(data, store.tenantId())) {
            await (!data.bkey ? 
              store.ownershipService.create(data, store.currentUser()) : 
              store.ownershipService.update(data, store.currentUser()));
          }
        }
        this.reload();
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
          this.reload();
        }
      },   

      async export(type: string): Promise<void> {
        console.log(`OwnershipListStore.export(${type}) is not yet implemented.`);
      },

      async delete(ownership?: OwnershipModel, readOnly = true): Promise<void> {
        if (!readOnly && ownership) {
          const result = await confirm(store.alertController, '@ownership.operation.delete.confirm', true);
          if (result === true) {
            await store.ownershipService.delete(ownership, store.currentUser());
            this.reload();
          }
        }
      },
    }
  }),
);
