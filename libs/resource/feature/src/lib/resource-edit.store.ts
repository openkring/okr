import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { Observable, of } from 'rxjs';

import { AppStore } from '@bk2/shared/feature';
import { debugItemLoaded } from '@bk2/shared/util-core';
import { AppNavigationService } from '@bk2/shared/util-angular';
import { ModelType, ResourceModel} from '@bk2/shared/models';

import { ResourceService } from '@bk2/resource/data-access';
import { convertFormToResource, ResourceFormModel } from '@bk2/resource/util';

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
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),

  withProps((store) => ({
    resResource: rxResource({
      request: () => ({
        resourceKey: store.resourceKey()
      }),
      loader: ({request}) => {
        let resource$: Observable<ResourceModel | undefined> = of(undefined);
        if (request.resourceKey) {
          resource$ = store.resourceService.read(request.resourceKey);
          debugItemLoaded('ResourceEditStore.resource', resource$, store.appStore.currentUser());
        }
        return resource$;
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
        return store.appStore.getTags(ModelType.Resource);
      },

      /************************************ ACTIONS ************************************* */

      async save(vm: ResourceFormModel): Promise<void> {
        const _resource = convertFormToResource(store.resource(), vm, store.appStore.tenantId());
        await (!_resource.bkey ? 
          store.resourceService.create(_resource, store.currentUser()) : 
          store.resourceService.update(_resource, store.currentUser()));
        store.appNavigationService.back();
      }
    }
  }),
);
