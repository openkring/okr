import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { ResourceCollection, ResourceModel } from '@bk2/shared-models';
import { chipMatches, getSystemQuery, isResource, nameMatches } from '@bk2/shared-util-core';

import { ResourceService } from '@bk2/resource-data-access';
import { FirestoreService } from '@bk2/shared-data-access';

import { ResourceEditModalComponent } from './resource-edit.modal';

export type ResourceListState = {
  searchTerm: string;
  selectedTag: string;
  selectedResourceType: string;
  selectedSubType: string;
  selectedGender: string;
};

const initialState: ResourceListState = {
  searchTerm: '',
  selectedTag: '',
  selectedResourceType: 'all',
  selectedSubType: 'all',
  selectedGender: 'all',
};

export const ResourceListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    resourceService: inject(ResourceService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    resourceResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
      }
    })
  })),

  withComputed((state) => {
    return {
      resources: computed(() => state.resourceResource.value() ?? []),
      resourcesCount: computed(() => state.resourceResource.value()?.length ?? 0), 
      filteredResources: computed(() => 
        state.resourceResource.value()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          nameMatches(resource.type, state.selectedResourceType()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      boats: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'boat') ?? []),
      rboats: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'rboat') ?? []),
      cars: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'car') ?? []),
      lockers: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'locker') ?? []),
      keys: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'key') ?? []),
      realestate: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'realestate') ?? []),
      pets: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'pet') ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      isLoading: computed(() => state.resourceResource.isLoading()),
    };
  }),
  withComputed((state) => {
    return {
      boatsCount: computed(() => state.boats().length ?? 0), 
      filteredBoats: computed(() => 
        state.boats()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          nameMatches(resource.subType, state.selectedSubType()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      rboatsCount: computed(() => state.rboats().length ?? 0), 
      filteredRboats: computed(() => 
        state.rboats()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          nameMatches(resource.subType, state.selectedSubType(), true) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      carsCount: computed(() => state.cars().length ?? 0),
      filteredCars: computed(() =>
        state.cars()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      lockersCount: computed(() => state.lockers().length ?? 0),
      filteredLockers: computed(() =>
        state.lockers()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          nameMatches(resource.subType, state.selectedGender()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      keysCount: computed(() => state.keys().length ?? 0),
      filteredKeys: computed(() =>
        state.keys()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      realestateCount: computed(() => state.realestate().length ?? 0),
      filteredRealestate: computed(() =>
        state.realestate()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      petsCount: computed(() => state.pets().length ?? 0),
      filteredPets: computed(() =>
        state.pets()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      )
    }
  }),

  withMethods((store) => {
    return {
      reload() {
        store.resourceResource.reload();
      },
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedResourceType(selectedResourceType: string) {
        patchState(store, { selectedResourceType });
      },

      setSelectedSubType(selectedSubType: string) {
        patchState(store, { selectedSubType });
      },

      setSelectedGender(selectedGender: string) {
        patchState(store, { selectedGender });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getResourceTags(): string {
        return store.appStore.getTags('resource');
      },

      getBoatTags(): string {
        return store.appStore.getTags('resource.boat');
      },
      
      getCarTags(): string {
        return store.appStore.getTags('resource.car');
      },

      getKeyTags(): string {
        return store.appStore.getTags('resource.key');
      },

      getLockerTags(): string {
        return store.appStore.getTags('resource.locker');
      },

      getPetTags(): string {
        return store.appStore.getTags('resource.pet');
      },

      getRowingBoatTags(): string {
        return store.appStore.getTags('resource.rboat');
      },

      getRealEstateTags(): string {
        return store.appStore.getTags('resource.realestate');
      },

      /******************************** actions ******************************************* */
      async add(isTypeEditable = false, readOnly = true): Promise<void> {
        if (readOnly) return;
        const resource = new ResourceModel(store.tenantId());
        await this.edit(resource, isTypeEditable, readOnly);
        this.reload();
      },

      async edit(resource: ResourceModel, isTypeEditable = false, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: ResourceEditModalComponent,
          componentProps: {
            resource,
            isTypeEditable,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isResource(data, store.tenantId())) {
            resource.bkey === '' ?
              await store.resourceService.create(data, store.currentUser()) : 
              await store.resourceService.update(data, store.currentUser());
          }
        }
        this.reload();        
      },

      async delete(resource: ResourceModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.resourceService.delete(resource, store.currentUser());
        store.resourceResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`ResourceListStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
