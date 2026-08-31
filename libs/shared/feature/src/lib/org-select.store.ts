import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@okr/shared-data-access';
import { OrgModel, UserModel } from '@okr/shared-models';
import { chipMatches, nameMatches } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { AppStore } from './app.store';
import { SHARED_FEATURE_I18N_KEYS, SharedFeatureI18n } from './select-i18n';

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
    i18n: inject(I18nService).translateAll(SHARED_FEATURE_I18N_KEYS) as SharedFeatureI18n
  })),

  withComputed((store) => {
    return {
      orgs: computed(() => store.appStore.allOrgs()),
      isLoading: computed(() => store.appStore.isReferenceDataLoading())
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
