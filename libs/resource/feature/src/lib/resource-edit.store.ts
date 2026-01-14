import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { ResourceModel } from '@bk2/shared-models';
import { debugItemLoaded } from '@bk2/shared-util-core';

import { ResourceService } from '@bk2/resource-data-access';

/**
 * the resourceEditPage is setting the resourceKey, the store needs to read the corresponding resource 
 */
export type ResourceEditState = {
  resourceKey: string | undefined;
};

export const initialState: ResourceEditState = {
  resourceKey: undefined,
};

export const ResourceEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    resourceService: inject(ResourceService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),

  withProps((store) => ({
    resResource: rxResource({
      params: () => ({
        resourceKey: store.resourceKey()
      }),
      stream: ({params}) => {
        return store.resourceService.read(params.resourceKey).pipe(
          debugItemLoaded('ResourceEditStore.resource', store.appStore.currentUser())
        );
      }
    }),    
  })),
  
  withComputed((state) => {
    return {
      resource: computed(() => state.resResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.resResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      
      /************************************ SETTERS ************************************* */
      setResourceKey(resourceKey: string): void {
        patchState(store, { resourceKey });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('resource');
      },

      /************************************ ACTIONS ************************************* */

      async save(resource?: ResourceModel): Promise<void> {
        if (!resource) return;
        await (!resource.bkey ? 
          store.resourceService.create(resource, store.currentUser()) : 
          store.resourceService.update(resource, store.currentUser()));
      }
    }
  }),
);
