import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { ResourceCollection, ResourceModel } from '@bk2/shared-models';
import { AppNavigationService, navigateByUrl } from '@bk2/shared-util-angular';
import { chipMatches, getSystemQuery, isResource, nameMatches } from '@bk2/shared-util-core';

import { ResourceService } from '@bk2/resource-data-access';
import { FirestoreService } from '@bk2/shared-data-access';

import { ResourceEditModalComponent } from './resource-edit.modal';

export type ResourceListState = {
  searchTerm: string;
  selectedTag: string;
  selectedResourceType: string;
  selectedBoatType: string;
  selectedGender: string;
};

const initialState: ResourceListState = {
  searchTerm: '',
  selectedTag: '',
  selectedResourceType: 'all',
  selectedBoatType: 'all',
  selectedGender: 'all',
};

export const ResourceListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    resourceService: inject(ResourceService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
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
      boats: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'rboat') ?? []),
      lockers: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'locker') ?? []),
      keys: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === 'key') ?? []),
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
          nameMatches(resource.subType, state.selectedBoatType()) &&
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
    }
  }),

  withMethods((store) => {
    return {
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedResourceType(selectedResourceType: string) {
        patchState(store, { selectedResourceType });
      },

      setSelectedBoatType(selectedBoatType: string) {
        patchState(store, { selectedBoatType });
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

      getLockerTags(): string {
        return store.appStore.getTags('resource.locker');
      },

      getKeyTags(): string {
        return store.appStore.getTags('resource.key');
      },
      
      getRowingBoatTags(): string {
        return store.appStore.getTags('resource.rboat');
      },

      /******************************** actions ******************************************* */
      async add(isTypeEditable = false, readOnly = true): Promise<void> {
        if (readOnly) return;
        const resource = new ResourceModel(store.tenantId());
        this.edit(resource, isTypeEditable, readOnly);
        store.resourceResource.reload();
      },

      async edit(resource: ResourceModel, isTypeEditable = false, readOnly = true): Promise<void> {
        console.log('ResourceListStore.edit()', resource, isTypeEditable, readOnly);
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
        if (role === 'confirm') {
          if (isResource(data, store.tenantId())) {
            await (!data.bkey ? 
              store.resourceService.create(data, store.currentUser()) : 
              store.resourceService.update(data, store.currentUser()));
          }
        }
        //store.appNavigationService.pushLink('/resource/all' );
        //await navigateByUrl(store.router, `/resource/${resource.bkey}`, { isTypeEditable, readOnly });
        store.resourceResource.reload();        
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
