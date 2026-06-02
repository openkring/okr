import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { GroupModel, UserModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { AppStore } from './app.store';
import { GROUP_SELECT_I18N_KEYS, GroupSelectI18n } from './select-i18n';
export type { GroupSelectI18n };


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
    i18nService: inject(I18nService)   
  })),

  withProps((store) => ({
      i18n: store.i18nService.translateAll(GROUP_SELECT_I18N_KEYS),
  })),

  withComputed((store) => {
    return {
      groups: computed(() => store.appStore.allGroups()),
      isLoading: computed(() => store.appStore.isLoading())
    }
  }),

  withComputed((store) => {
    return {
      groupsCount: computed(() => store.groups()?.length ?? 0), 
      filteredGroups: computed(() => 
        store.groups()?.filter((group: GroupModel) => 
          nameMatches(group.index, store.searchTerm()) &&
          chipMatches(group.tags, store.selectedTag()))
      )
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
