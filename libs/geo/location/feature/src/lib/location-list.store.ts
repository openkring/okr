import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { LocationModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { AlertService, copyToClipboard } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';
import { MapViewModalComponent } from '@bk2/shared-ui';

import { LocationConversionService, LocationService } from '@bk2/location-data-access';
import { isLocation } from '@bk2/location-util';

import { LocationEditModalComponent } from './location-edit.modal';

function zoomForBounds(latSpan: number, lngSpan: number): number {
  const span = Math.max(latSpan, lngSpan);
  if (span === 0) return 15;
  return Math.min(15, Math.max(1, Math.round(Math.log2(360 / span)) - 1));
}

export type LocationListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
};

export const initialState: LocationListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
};

export const LocationListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    locationService: inject(LocationService),
    locationConversionService: inject(LocationConversionService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      copy_conf: '@location.operation.copy.conf',
    }),
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
          nameMatches(location.type, state.selectedType()) &&
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

      setSelectedType(selectedType: string) {
        patchState(store, { selectedType });
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
            await store.locationConversionService.convert(data);  // address string comes from AddressModel (not yet wired)
            data.bkey?.length > 0 ?
              await store.locationService.update(data, store.currentUser()) :
              await store.locationService.create(data, store.currentUser());
          }
        }
        store.locationsResource.reload();
      },

      async convert(location: LocationModel): Promise<void> {
        await store.locationConversionService.convert(location);
        await store.locationService.update(location, store.currentUser());
      },

      async delete(location: LocationModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.locationService.delete(location, store.currentUser());
        this.reset();
      },

      async export(type: string): Promise<void> {
        console.log(`LocationListStore.export(${type}) is not yet implemented.`);
      },

      async showOnMap(location?: LocationModel): Promise<void> {
        if (location) { // show a single location as the center of the map
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
        } else {
          const locations = (store.filteredLocations() ?? [])
            .filter(l => l.latitude !== 0 || l.longitude !== 0);
          if (locations.length === 0) return;

          const center = locations.find(l => l.bkey === store.appStore.tenantId()) ?? locations[0];
          const lats = locations.map(l => l.latitude);
          const lngs = locations.map(l => l.longitude);
          const latSpan = Math.max(...lats) - Math.min(...lats);
          const lngSpan = Math.max(...lngs) - Math.min(...lngs);
          const otherCoords = locations
            .filter(l => l.bkey !== center.bkey)
            .map(l => ({ lat: l.latitude, lng: l.longitude }));

          const modal = await store.modalController.create({
            component: MapViewModalComponent,
            componentProps: {
              initialPosition: { lat: center.latitude, lng: center.longitude },
              coordinates: otherCoords,
              zoom: zoomForBounds(latSpan, lngSpan),
              enableTrafficLayer: false
            }
          });
          modal.present();
          await modal.onWillDismiss();
        }

      },

      async copy(location: LocationModel): Promise<void> {
        await copyToClipboard(location.latitude + ', ' + location.longitude);
        await store.alertService.showToast(store.i18n.copy_conf());
      },
  }})
);
