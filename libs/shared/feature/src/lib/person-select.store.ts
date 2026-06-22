import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { PersonModel, UserModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { AppStore } from './app.store';
import { SHARED_FEATURE_I18N_KEYS, SharedFeatureI18n } from './select-i18n';
import { MIN_CUSTOM_SEARCH_LENGTH, normalizeForCompare, normalizeWhitespace } from './location-select.store';


export type PersonSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  selectedTag: string;
  allowCustom: boolean;
};

export const personInitialState: PersonSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
  allowCustom: false,
};

export const PersonSelectStore = signalStore(
  withState(personInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    i18n: inject(I18nService).translateAll(SHARED_FEATURE_I18N_KEYS) as SharedFeatureI18n
  })),

  withComputed((store) => {
    return {
      persons: computed(() => store.appStore.allPersons()),
      isLoading: computed(() => store.appStore.isLoading())
    }
  }),

  withComputed((store) => {
    return {
      personsCount: computed(() => store.persons()?.length ?? 0),
      filteredPersons: computed(() =>
        store.persons()?.filter((person: PersonModel) =>
          nameMatches(person.index, store.searchTerm()) &&
          chipMatches(person.tags, store.selectedTag()))
      ),
      customLabel: computed(() => normalizeWhitespace(store.searchTerm())),
      hasExactMatch: computed(() => {
        const q = normalizeForCompare(store.searchTerm());
        return (store.persons() ?? []).some(p => normalizeForCompare(`${p.firstName} ${p.lastName}`) === q);
      }),
    }
  }),

  withComputed((store) => ({
    showCustomEntry: computed(() =>
      store.allowCustom()
      && store.customLabel().length >= MIN_CUSTOM_SEARCH_LENGTH
      && !store.hasExactMatch()
    ),
  })),

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
      },

      setAllowCustom(allowCustom: boolean) {
        patchState(store, { allowCustom });
      }
    }
  }),
);
