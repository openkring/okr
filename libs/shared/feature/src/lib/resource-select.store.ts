import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { chipMatches, debugListLoaded, getSystemQuery, nameMatches, searchData } from '@bk2/shared/util-core';
import { ResourceCollection, ResourceModel, UserModel } from '@bk2/shared/models';
import { AppStore } from './app.store';

export type ResourceSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  selectedTag: string;
};

export const resourceInitialState: ResourceSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
};

export const ResourceSelectStore = signalStore(
  withState(resourceInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    resourcesResource: rxResource({
      stream: () => {
        const resources$ = searchData<ResourceModel>(store.appStore.firestore, ResourceCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
        debugListLoaded('resources (to select)', resources$, store.currentUser());
        return resources$;
      }
    })
  })),

  withComputed((state) => {
    return {
      resources: computed(() => state.resourcesResource.value()),
      resourcesCount: computed(() => state.resourcesResource.value()?.length ?? 0), 
      filteredResources: computed(() => 
        state.resourcesResource.value()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      isLoading: computed(() => state.resourcesResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {
      setCurrentUser(currentUser: UserModel | undefined) {
        patchState(store, { currentUser });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      }
    }
  }),
);
