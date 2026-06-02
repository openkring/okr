import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { OrgModel, UserModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { AppStore } from './app.store';
import { ORG_SELECT_I18N_KEYS, OrgSelectI18n } from './select-i18n';
export type { OrgSelectI18n };

export type OrgSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  selectedTag: string;
};

export const orgInitialState: OrgSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
};

export const OrgSelectStore = signalStore(
  withState(orgInitialState),
  withProps(() => ({
    firestoreService: inject(FirestoreService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService)  
  })),

  withProps((store) => ({
      i18n: store.i18nService.translateAll(ORG_SELECT_I18N_KEYS),
  })),

  withComputed((store) => {
    return {
      orgs: computed(() => store.appStore.allOrgs()),
      isLoading: computed(() => store.appStore.isLoading())
    }
  }),

  withComputed((store) => {
    return {
      orgsCount: computed(() => store.orgs()?.length ?? 0), 
      filteredOrgs: computed(() => 
        store.orgs()?.filter((org: OrgModel) => 
          nameMatches(org.index, store.searchTerm()) &&
          chipMatches(org.tags, store.selectedTag()))
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
