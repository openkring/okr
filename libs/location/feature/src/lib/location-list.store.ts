import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { chipMatches, nameMatches } from '@bk2/shared/util';
import { AllCategories, LocationModel, LocationType, ModelType } from '@bk2/shared/models';
import { categoryMatches } from '@bk2/shared/categories';
import { AppStore } from '@bk2/shared/feature';

import { LocationService } from '@bk2/location/data-access';
import { isLocation } from '@bk2/location/util';
import { LocationEditModalComponent } from './location-edit.modal';

export type LocationListState = {
  searchTerm: string;
  selectedTag: string;
  selectedCategory: LocationType | typeof AllCategories;
};

export const initialState: LocationListState = {
  searchTerm: '',
  selectedTag: '',
  selectedCategory: AllCategories,
};

export const LocationListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    locationService: inject(LocationService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    locationsResource: rxResource({
      loader: () => {
        return store.locationService.list();
      }
    })
  })),

  withComputed((state) => {
    return {
      locations: computed(() => state.locationsResource.value()),
      locationsCount: computed(() => state.locationsResource.value()?.length ?? 0), 
      filteredLocations: computed(() => 
        state.locationsResource.value()?.filter((location: LocationModel) => 
          nameMatches(location.index, state.searchTerm()) &&
          categoryMatches(location.type, state.selectedCategory()) &&
          chipMatches(location.tags, state.selectedTag()))
      ), 
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.locationsResource.isLoading()), 
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.locationsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedCategory(selectedCategory: LocationType | typeof AllCategories) {
        patchState(store, { selectedCategory });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Location);
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        const _location = new LocationModel(store.appStore.tenantId());
        const _modal = await store.modalController.create({
          component: LocationEditModalComponent,
          componentProps: {
            location: _location,
            currentUser: store.currentUser()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isLocation(data, store.appStore.tenantId())) {
            await store.locationService.create(data, store.currentUser());
          }
        }
        store.locationsResource.reload();
      },

      async delete(location: LocationModel): Promise<void> {
        await store.locationService.delete(location);
        this.reset();
      },

      async edit(location: LocationModel): Promise<void> {
        const _modal = await store.modalController.create({
          component: LocationEditModalComponent,
          componentProps: {
            location: location,
            currentUser: store.currentUser()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isLocation(data, store.appStore.tenantId())) {
            await store.locationService.update(data);
          }
        }
        store.locationsResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`LocationListStore.export(${type}) is not yet implemented.`);
      },
  }})
);


