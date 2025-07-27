import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { debugItemLoaded, debugMessage } from '@bk2/shared/util-core';
import { SectionModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { SectionService } from '@bk2/cms/section/data-access';
import { of } from 'rxjs';

export type SectionDetailState = {
  sectionId: string;
};

export const initialState: SectionDetailState = {
  sectionId: '',
};

export const SectionDetailStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    sectionService: inject(SectionService),
    modalController: inject(ModalController),
  })),

  withComputed((state) => {
    return {
      tenantId: computed(() => state.appStore.tenantId()),
      currentUser: computed(() => state.appStore.currentUser()),
      showDebugInfo: computed(() => state.appStore.showDebugInfo()),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
    };
  }),

  withProps((store) => ({
    sectionResource: rxResource({
      params: () => ({
        sectionId: store.sectionId()
      }),
      stream: ({ params }) => {
        if (!params.sectionId || params.sectionId.length === 0) {
          return of(undefined);
        }
        const _section$ = store.sectionService.read(params.sectionId);
        debugItemLoaded<SectionModel>(`SectionDetailStore.sectionResource`, _section$, store.currentUser());
        return _section$;
      }
    })
  })),

  withComputed((state) => {
    return {
      section: computed(() => state.sectionResource.value() ?? undefined),
      isLoading: computed(() => state.sectionResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      /******************************** setters (filter) ******************************************* */
      /**
       * Updates the page id which triggers the loading of the page.
       * @param id the key of the page
       */
      setSectionId(sectionId: string) {
        debugMessage(`SectionDetailStore.setSectionId(${sectionId})`, store.currentUser());
        patchState(store, { sectionId });
      },

      /******************************** actions ******************************************* */

      async export(type: string): Promise<void> {
        console.log(`SectionDetailStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
