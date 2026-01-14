import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { GroupCollection, GroupModel, UserModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { AppStore } from './app.store';

export type GroupSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  selectedTag: string;
};

export const groupInitialState: GroupSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
};

export const GroupSelectStore = signalStore(
  withState(groupInitialState),
  withProps(() => ({
    firestoreService: inject(FirestoreService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    groupsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc').pipe(
          debugListLoaded('groups (to select)', store.currentUser())
        );
      }
    }),
  })),

  withComputed((state) => {
    return {
      groups: computed(() => state.groupsResource.value()),
      groupsCount: computed(() => state.groupsResource.value()?.length ?? 0), 
      filteredGroups: computed(() => 
        state.groupsResource.value()?.filter((group: GroupModel) => 
          nameMatches(group.index, state.searchTerm()) &&
          chipMatches(group.tags, state.selectedTag()))
      ),
      isLoading: computed(() => state.groupsResource.isLoading()),
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
