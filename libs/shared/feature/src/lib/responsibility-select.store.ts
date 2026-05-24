import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ResponsibilityModel, UserModel } from '@bk2/shared-models';
import { nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { AppStore } from './app.store';
import { PFX } from './scope';

const RESPONSIBILITY_SELECT_I18N_KEYS = {
  responsibility_select:      PFX + 'responsibility.select',
  responsibility_empty:       PFX + 'responsibility.empty',
}

export type PersonSelectI18n = { [K in keyof typeof RESPONSIBILITY_SELECT_I18N_KEYS]: Signal<string> };

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
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(RESPONSIBILITY_SELECT_I18N_KEYS),

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
