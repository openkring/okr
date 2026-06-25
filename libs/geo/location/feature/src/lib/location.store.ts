import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel, LocationModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { AlertService, copyToClipboard } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';
import { MapViewModal } from '@bk2/shared-ui';

import { LocationConversionService, LocationService } from '@bk2/location-data-access';
import { isLocation } from '@bk2/location-util';

import { LOCATION_I18N_KEYS, LocationI18n } from '@bk2/location-util';
export type { LocationI18n };

function zoomForBounds(latSpan: number, lngSpan: number): number {
  const span = Math.max(latSpan, lngSpan);
  if (span === 0) return 15;
  return Math.min(15, Math.max(1, Math.round(Math.log2(360 / span)) - 1));
}

export type LocationState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
};

export const initialState: LocationState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
};

export const LocationStore = signalStore(
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
    i18n: store.i18nService.translateAll(LOCATION_I18N_KEYS),
    locationsResource: rxResource({
      stream: () => {
        return store.locationService.list();
      }
    })
  })),

  withComputed((store) => {
    return {
      locations: computed(() => store.locationsResource.value()),
      locationsCount: computed(() => store.locationsResource.value()?.length ?? 0), 
      filteredLocations: computed(() => 
        store.locationsResource.value()?.filter((location: LocationModel) => 
          nameMatches(location.index, store.searchTerm()) &&
          nameMatches(location.type, store.selectedType()) &&
          chipMatches(location.tags, store.selectedTag()))
      ), 
      currentUser: computed(() => store.appStore.currentUser()),
      tenantId: computed(() => store.appStore.tenantId()),
      isLoading: computed(() => store.locationsResource.isLoading()), 
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

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('location_type');
      },

      /******************************* actions *************************************** */
      async add(readOnly = true): Promise<void> {
        const location = new LocationModel(store.appStore.tenantId());
        await this.edit(location, readOnly);
      },

      async edit(location: LocationModel, readOnly = true): Promise<void> {
        const { LocationEditModal } = await import('./location-edit.modal');
        const modal = await store.modalController.create({
          component: LocationEditModal,
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
            // best-effort enrichment: a conversion failure must not block saving the location
            try {
              await store.locationConversionService.convert(data);  // address string comes from AddressModel (not yet wired)
              if (!data.address?.length) {
                data.address = data.name;
              }
            } catch (error) {
              console.warn('LocationStore.edit: location conversion failed, saving without enrichment', error);
              await store.alertService.showToast(store.i18n.convert_error());
            }
            data.bkey?.length > 0 ?
              await store.locationService.update(data, store.currentUser()) :
              await store.locationService.create(data, store.currentUser());
          }
        }
        store.locationsResource.reload();
      },

      async convert(location: LocationModel): Promise<void> {
        try {
          await store.locationConversionService.convert(location);
        } catch (error) {
          console.warn('LocationStore.convert: location conversion failed, saving without enrichment', error);
          await store.alertService.showToast(store.i18n.convert_error());
        }
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
            component: MapViewModal,
            componentProps: {
              title: location.name,
              center: {
                lat: location.latitude,
                lng: location.longitude,
                title: location.name,
                what3words: location.what3words,
                distance: location.distance,
              },
              zoom: 15
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
          const otherMarkers = locations
            .filter(l => l.bkey !== center.bkey)
            .map(l => ({ lat: l.latitude, lng: l.longitude, title: l.name, what3words: l.what3words, distance: l.distance }));

          const modal = await store.modalController.create({
            component: MapViewModal,
            componentProps: {
              title: store.i18n.locations(),
              center: { lat: center.latitude, lng: center.longitude, title: center.name, what3words: center.what3words, distance: center.distance },
              markers: otherMarkers,
              zoom: zoomForBounds(latSpan, lngSpan)
            }
          });
          modal.present();
          await modal.onWillDismiss();
        }

      },

      async copy(location: LocationModel, isW3w = true): Promise<void> {
        const value = isW3w ? location.what3words : location.latitude + ', ' + location.longitude
        await copyToClipboard(value);
        await store.alertService.showToast(store.i18n.copy_conf());
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.update();
        } else {
          return store.i18n.create();
        }
      },
  }})
);
