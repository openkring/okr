import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryCollection, CategoryListModel, getDefaultMembershipCategory, ModelType, OrgCollection, OrgModel } from '@bk2/shared-models';
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
        const org$ = store.firestoreService.readModel<OrgModel>(OrgCollection, params.orgId);
        debugItemLoaded<OrgModel>(`org ${params.orgId}`, org$, params.currentUser);
        return org$;
      }
    })
  })),

  withComputed((state) => {
    return {
      org: computed(() => state.orgResource.value() ?? undefined),
      membershipCategoryKey: computed(() => `mcat_${state.orgId()}`),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      privacySettings: computed(() => state.appStore.privacySettings()),
    };
  }),
  withProps((store) => ({
    mcatResource: rxResource({
      params: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      stream: ({params}) => {
        const mcat$ = store.firestoreService.readModel<CategoryListModel>(CategoryCollection, params.mcatId);
        debugItemLoaded<CategoryListModel>(`mcat ${params.mcatId}`, mcat$, store.appStore.currentUser());           
        return mcat$;
      }
    })
  })),
  withComputed((state) => {
    return {
      membershipCategory: computed(() => state.mcatResource.value() ?? getDefaultMembershipCategory(state.appStore.tenantId())),
      isLoading: computed(() => state.orgResource.isLoading() || state.mcatResource.isLoading()),
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
        return store.appStore.getTags(ModelType.Person);
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

