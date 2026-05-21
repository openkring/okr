import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { ActivityCollection, ActivityModel } from '@bk2/shared-models';
import { getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { ActivityService } from '@bk2/activity-data-access';

import { ActivityViewModal } from './activity-view.modal';
import { PFX } from './scope';

const ACTIVITY_I18N_KEYS = {
  title:      PFX + 'title',
  empty:      PFX + 'empty',
  timestamp:  PFX + 'timestamp',
  scope:      PFX + 'scope',
  action:     PFX + 'action',
  author:     PFX + 'author',
  payload:    PFX + 'payload',
  view_title: PFX + 'view.title'
} satisfies Record<string, string>;

export type ActivityI18n = { [K in keyof typeof ACTIVITY_I18N_KEYS]: Signal<string> };

export type ActivityState = {
  searchTerm: string;
  selectedScope: string;
  selectedAction: string;
  maxItems: number | undefined;
};

const initialState: ActivityState = {
  searchTerm: '',
  selectedScope: 'all',
  selectedAction: 'all',
  maxItems: undefined,
};

export const ActivityStore = signalStore(
  withState(initialState),
  withProps(() => ({
    activityService: inject(ActivityService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(ACTIVITY_I18N_KEYS),
  
    activitiesResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([] as ActivityModel[]);
        const query = getSystemQuery(params.tenantId);
        return store.appStore.firestoreService.searchData<ActivityModel>(
          ActivityCollection, query, 'timestamp', 'desc'
        );
      },
    }),
  })),

  withComputed((state) => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.env.tenantId),
    isLoading: computed(() => state.activitiesResource.isLoading()),

    activities: computed(() => {
      const all = state.activitiesResource.value() ?? [];
      const term = state.searchTerm().toLowerCase();
      const scope = state.selectedScope();
      const action = state.selectedAction();
      return all.filter(a => {
        if (scope !== 'all' && a.scope !== scope) return false;
        if (action !== 'all' && a.action !== action) return false;
        if (term && !nameMatches(a.index, term)) return false;
        return true;
      }).slice(0, state.maxItems() ?? all.length);
    }),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },
    setSelectedScope(selectedScope: string): void {
      patchState(store, { selectedScope });
    },
    setSelectedAction(selectedAction: string): void {
      patchState(store, { selectedAction });
    },
    setMaxItems(maxItems: number | undefined): void {
      patchState(store, { maxItems });
    },

    async view(activity: ActivityModel): Promise<void> {
      const modal = await store.modalController.create({
        component: ActivityViewModal,
        componentProps: { activity },
      });
      await modal.present();
    },

    async delete(activity: ActivityModel): Promise<void> {
      await store.activityService.delete(activity, store.currentUser() ?? undefined);
      store.activitiesResource.reload();
    },
  }))
);
