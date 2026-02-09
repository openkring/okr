import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { of, take } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel, OrgCollection, OrgModel } from '@bk2/shared-models';
import { debugItemLoaded } from '@bk2/shared-util-core';

export type PersonNewState = {
  orgId: string | undefined;
};

export const initialState: PersonNewState = {
  orgId: undefined,
};

export const PersonNewStore = signalStore(
  withState(initialState),

  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController) 
  })),

  withProps((store) => ({
    orgResource: rxResource({
      params: () => ({
        orgId: store.orgId(),
        currentUser: store.appStore.currentUser()
      }),  
      stream: ({params}) => {
        if (!params.orgId) return of(undefined);
        return store.firestoreService.readModel<OrgModel>(OrgCollection, params.orgId).pipe(
          take(1),
          debugItemLoaded(`org ${params.orgId}`, params.currentUser)
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      org: computed(() => state.orgResource.value() ?? undefined),
      membershipCategoryKey: computed(() => state.orgResource.value()?.membershipCategoryKey ?? 'mcat_default'),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      privacySettings: computed(() => state.appStore.privacySettings()),
      defaultMcat: computed(() => state.appStore.getCategory('mcat_default'))
    };
  }),
  
  withComputed((state) => {
    return {
      membershipCategory: computed<CategoryListModel>(() => state.appStore.getCategory(state.membershipCategoryKey()) ?? state.defaultMcat()),
      isLoading: computed(() => state.orgResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      /******************************** setters ******************************************* */
      setOrgId(orgId: string) {
        patchState(store, { orgId });
      },
      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('person');
      },
    };
  }),

  withHooks({
    onInit(store) {
      patchState(store, { 
        orgId: store.appStore.appConfig().ownerOrgId 
      });
    }
  })
);

