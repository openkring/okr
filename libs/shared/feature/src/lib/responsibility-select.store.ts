import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ResponsibilityModel, UserModel } from '@bk2/shared-models';
import { nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { AppStore } from './app.store';
import { SHARED_FEATURE_I18N_KEYS, SharedFeatureI18n } from './select-i18n';

export type ResponsibilitySelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
};

export const responsibilityInitialState: ResponsibilitySelectState = {
  searchTerm: '',
  currentUser: undefined,
};

export const ResponsibilitySelectStore = signalStore(
  withState(responsibilityInitialState),
  withProps(() => ({
    responsibilityService: inject(ResponsibilityService),
    appStore: inject(AppStore),
    i18n: inject(I18nService).translateAll(SHARED_FEATURE_I18N_KEYS) as SharedFeatureI18n
  })),
  withProps((store) => ({
    responsibilitiesResource: rxResource({
      stream: () => store.responsibilityService.list('name', 'asc').pipe(),
    }),
  })),

  withComputed((state) => ({
    responsibilities: computed(() => state.responsibilitiesResource.value()),
    filteredResponsibilities: computed(() =>
      state.responsibilitiesResource.value()?.filter((r: ResponsibilityModel) =>
        nameMatches(r.index, state.searchTerm())
      )
    ),
    isLoading: computed(() => state.responsibilitiesResource.isLoading()),
  })),

  withMethods((store) => ({
    setCurrentUser(currentUser: UserModel | undefined) {
      patchState(store, { currentUser });
    },
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
  })),
);
