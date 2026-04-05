import { computed, inject } from '@angular/core';
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
  })),
  withProps((store) => ({
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
