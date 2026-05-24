import { computed, inject, Signal } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { PersonModel, UserModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { AppStore } from './app.store';
import { PFX } from './scope';

const PERSON_SELECT_I18N_KEYS = {
  person_select:              PFX + 'person.select',
  person_empty:               PFX + 'person.empty',
}

export type PersonSelectI18n = { [K in keyof typeof PERSON_SELECT_I18N_KEYS]: Signal<string> };


export type PersonSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  selectedTag: string;
};

export const personInitialState: PersonSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
};

export const PersonSelectStore = signalStore(
  withState(personInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    i18nService: inject(I18nService)
  })),

  withProps((store) => ({
      i18n: store.i18nService.translateAll(PERSON_SELECT_I18N_KEYS),
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
