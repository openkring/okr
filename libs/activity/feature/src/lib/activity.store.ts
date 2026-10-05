import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { ActivityCollection, ActivityModel, SessionCollection, SessionModel } from '@okr/shared-models';
import { addDuration, DateFormat, getSystemQuery, getTodayStr, nameMatches } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import { ActivityService } from '@okr/activity-data-access';
import { ACTIVITY_I18N_KEYS, ACTIVITY_STATS_DAYS, ActivityI18n, getDailyActivityStats } from '@okr/activity-util';

export type { ActivityI18n };

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

    /**
     * Sessions of the statistics window, for users per day and usage time. Starts one day early so
     * a session running past midnight into the first day is counted. Sessions are admin-only to
     * read, like this page. No isArchived clause: matches the (tenants CONTAINS, startedAt DESC)
     * index the AOC session list uses.
     */
    sessionsResource: rxResource({
      params: resourceParams(() => ({
        userKey: store.appStore.currentUser()?.okey ?? '',
        tenantId: store.appStore.env.tenantId,
        today: getTodayStr(DateFormat.StoreDate),
      })),
      stream: ({ params }) => {
        if (!params.userKey) return of([] as SessionModel[]);
        const from = addDuration(params.today, { days: -ACTIVITY_STATS_DAYS }) + '000000';
        return store.appStore.firestoreService.searchData<SessionModel>(SessionCollection, [
          { key: 'tenants', operator: 'array-contains', value: params.tenantId },
          { key: 'startedAt', operator: '>=', value: from },
        ], 'startedAt', 'desc');
      },
    }),
  })),

  withComputed((state) => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.env.tenantId),
    isLoading: computed(() => state.activitiesResource.isLoading()),

    /** Users, successful logins, auth errors and usage time per day — unaffected by the list filters. */
    dailyStats: computed(() => getDailyActivityStats(
      state.activitiesResource.value() ?? [],
      state.sessionsResource.value() ?? [],
      getTodayStr(DateFormat.StoreDate),
    )),

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
      const { ActivityViewModal } = await import('./activity-view.modal');
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
