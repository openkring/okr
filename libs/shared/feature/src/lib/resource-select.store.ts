import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@okr/shared-data-access';
import { ResourceCollection, ResourceModel, UserModel } from '@okr/shared-models';
import { chipMatches, debugListLoaded, getSystemQuery, nameMatches } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { AppStore } from './app.store';
import { SHARED_FEATURE_I18N_KEYS, SharedFeatureI18n } from './select-i18n';
import { MIN_CUSTOM_SEARCH_LENGTH, normalizeForCompare, normalizeWhitespace } from './location-select.store';

export type ResourceSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  selectedTag: string;
  /** Offer the typed term as an ad-hoc entry when it matches no resource. Opt-in per caller. */
  allowCustom: boolean;
};

export const resourceInitialState: ResourceSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
  allowCustom: false,
};

export const ResourceSelectStore = signalStore(
  withState(resourceInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    i18n: inject(I18nService).translateAll(SHARED_FEATURE_I18N_KEYS) as SharedFeatureI18n
  })),
  withProps((store) => ({
    resourcesResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc').pipe(
          debugListLoaded('resources (to select)', store.currentUser())
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      resources: computed(() => state.resourcesResource.value()),
      resourcesCount: computed(() => state.resourcesResource.value()?.length ?? 0), 
      // Firestore orders by raw byte value; re-sort locale-aware so umlauts/case land where a reader expects them
      filteredResources: computed(() =>
        state.resourcesResource.value()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
          .sort((a, b) => a.name.localeCompare(b.name))
      ),
      isLoading: computed(() => state.resourcesResource.isLoading()),
      customLabel: computed(() => normalizeWhitespace(state.searchTerm())),
      hasExactMatch: computed(() => {
        const q = normalizeForCompare(state.searchTerm());
        return (state.resourcesResource.value() ?? []).some((r: ResourceModel) => normalizeForCompare(r.name) === q);
      }),
    }
  }),

  withComputed((store) => ({
    /**
     * A boat (or any resource) that is not in the inventory still has to be loggable: offer the
     * typed term itself once it is long enough to be a name and matches nothing exactly.
     */
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

      setAllowCustom(allowCustom: boolean) {
        patchState(store, { allowCustom });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      }
    }
  }),
);
