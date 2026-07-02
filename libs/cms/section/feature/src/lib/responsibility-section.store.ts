import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { ResponsibilityConfig, ResponsibilitySection } from '@okr/shared-models';
import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';

export type ResponsibilitySectionState = {
  okey: string;
  config: ResponsibilityConfig;
};

const initialState: ResponsibilitySectionState = {
  okey: '',
  config: { okey: '', showAvatar: true, showName: true, showDescription: true },
};

export const ResponsibilitySectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    responsibilityService: inject(ResponsibilityService),
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
    responsibilityResource: rxResource({
      // gate on currentUser: the responsibilities collection requires an authenticated tenant user (tenantRead).
      // Firing before auth is restored (notably mobile Safari) yields "Missing or insufficient permissions".
      params: () => ({ okey: store.okey(), currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser || !params.okey) return of(undefined);
        return store.responsibilityService.read(params.okey);
      },
    }),
  })),
  withComputed((state) => ({
    responsibility: computed(() => state.responsibilityResource.value()),
    isLoading: computed(() => state.responsibilityResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
  })),
  withMethods((store) => ({
    setConfig(section: ResponsibilitySection): void {
      const config = section.properties as ResponsibilityConfig;
      patchState(store, { okey: config.okey, config });
    },

    reload(): void {
      store.responsibilityResource.reload();
    },
  })),
);
