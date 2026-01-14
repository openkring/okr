import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { PersonCollection, PersonModel, UserModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { AppStore } from './app.store';

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
  })),
  withProps((store) => ({
    personsResource: rxResource({
      params: () => ({
        currentUser: store.currentUser()
      }),
      stream: ({params}) => {
        return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.appStore.tenantId()), 'lastName', 'asc').pipe(
          debugListLoaded('persons (to select)', params.currentUser)
        );
      }
    }),
  })),

  withComputed((state) => {
    return {
      persons: computed(() => state.personsResource.value()),
      isLoading: computed(() => state.personsResource.isLoading()),
    };
  }),

  withComputed((state) => {
    return {
      // all persons
      personsCount: computed(() => state.personsResource.value()?.length ?? 0), 
      filteredPersons: computed(() => 
        state.personsResource.value()?.filter((person: PersonModel) => 
          nameMatches(person.index, state.searchTerm()) &&
          chipMatches(person.tags, state.selectedTag()))
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
