import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { LocationModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { bkTranslate } from '@bk2/shared-i18n';
import { copyToClipboard, showToast } from '@bk2/shared-util-angular';
import { MapViewModalComponent } from '@bk2/shared-ui';

import { LocationService } from '@bk2/location-data-access';
import { isLocation } from '@bk2/location-util';

import { LocationEditModalComponent } from './location-edit.modal';

export type LocationListState = {
  searchTerm: string;
  selectedTag: string;
  selectedCategory: string;
};

export const initialState: LocationListState = {
  searchTerm: '',
  selectedTag: '',
  selectedCategory: 'all',
};

export const LocationListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    locationService: inject(LocationService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
  })),
  withProps((store) => ({
    locationsResource: rxResource({
      stream: () => {
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
          nameMatches(location.type, state.selectedCategory()) &&
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

      setSelectedCategory(selectedCategory: string) {
        patchState(store, { selectedCategory });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('location');
      },

      /******************************* actions *************************************** */
      async add(readOnly = true): Promise<void> {
        const location = new LocationModel(store.appStore.tenantId());
        await this.edit(location, readOnly);
      },

      async edit(location: LocationModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: LocationEditModalComponent,
          componentProps: {
            location: location,
            currentUser: store.currentUser(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isLocation(data, store.appStore.tenantId())) {
            data.bkey?.length > 0 ?
              await store.locationService.update(data, store.currentUser()) : 
              await store.locationService.create(data, store.currentUser());
          }
        }
        store.locationsResource.reload();
      },

      async delete(location: LocationModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.locationService.delete(location, store.currentUser());
        this.reset();
      },

      async export(type: string): Promise<void> {
        console.log(`LocationListStore.export(${type}) is not yet implemented.`);
      },

      async showOnMap(location: LocationModel): Promise<void> {
        console.log('LocationListStore.show is not yet implemented.');
        const modal = await store.modalController.create({
          component: MapViewModalComponent,
          componentProps: {
            title: location.name,
            initialPosition: {
              lat: location.latitude,
              lng: location.longitude,
            },
            zoom: 15,
            enableTrafficLayer: false
          }
        });
        modal.present();
        await modal.onWillDismiss();
      },

      async copy(location: LocationModel): Promise<void> {
        await copyToClipboard(location.latitude + ', ' + location.longitude);
        await showToast(store.toastController, bkTranslate('@location.operation.copy.conf'));
      },
  }})
);
