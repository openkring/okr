import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';

import { AppStore } from '@bk2/shared-feature';
import { ActivitiesConfig, ActivityCollection, ActivityModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { ActivityService } from '@bk2/activity-data-access';
import { ActivityViewModal } from '@bk2/activity-feature';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

const ACTIVITIES_SECTION_I18N_KEYS = {
  empty: PFX + 'activity.empty',
  more:  '@more',
} satisfies Record<string, string>;

export type ActivitiesSectionI18n = { [K in keyof typeof ACTIVITIES_SECTION_I18N_KEYS]: Signal<string> };

export type ActivitiesSectionState = {
  maxItems: number | undefined;
};

const initialState: ActivitiesSectionState = {
  maxItems: undefined,
};

export const ActivitiesSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    activityService: inject(ActivityService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(ACTIVITIES_SECTION_I18N_KEYS),

    activitiesResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        tenantId: store.appStore.env.tenantId,
        maxItems: store.maxItems(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([] as ActivityModel[]);
        const query = getSystemQuery(params.tenantId);
        return store.appStore.firestoreService.searchData<ActivityModel>(
          ActivityCollection, query, 'timestamp', 'desc'
        ).pipe(
          map(activities => params.maxItems !== undefined ? activities.slice(0, params.maxItems) : activities)
        );
      },
    }),
  })),

  withComputed((state) => ({
    currentUser: computed(() => state.appStore.currentUser()),
    isLoading: computed(() => state.activitiesResource.isLoading()),
    activities: computed(() => state.activitiesResource.value() ?? []),
  })),

  withMethods((store) => ({
    setConfig(config: ActivitiesConfig | undefined): void {
      patchState(store, { maxItems: config?.maxItems });
    },

    reload(): void {
      store.activitiesResource.reload();
    },

    async view(activity: ActivityModel): Promise<void> {
      const modal = await store.modalController.create({
        component: ActivityViewModal,
        componentProps: { activity },
      });
      await modal.present();
    },
  }))
);
