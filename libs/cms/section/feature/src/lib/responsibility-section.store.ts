import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { ResponsibilityConfig, ResponsibilitySection } from '@bk2/shared-models';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';

export type ResponsibilitySectionState = {
  bkey: string;
  config: ResponsibilityConfig;
};

const initialState: ResponsibilitySectionState = {
  bkey: '',
  config: { bkey: '', showAvatar: true, showName: true, showDescription: true },
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
      params: () => ({ bkey: store.bkey() }),
      stream: ({ params }) => {
        if (!params.bkey) return of(undefined);
        return store.responsibilityService.read(params.bkey);
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
      patchState(store, { bkey: config.bkey, config });
    },

    reload(): void {
      store.responsibilityResource.reload();
    },
  })),
);
