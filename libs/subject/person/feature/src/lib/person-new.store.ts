import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { CategoryCollection, CategoryListModel, getDefaultMembershipCategory, ModelType, OrgCollection, OrgModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';
import { debugItemLoaded, readModel } from '@bk2/shared/util-core';

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
    modalController: inject(ModalController) 
  })),

  withProps((store) => ({
    orgResource: rxResource({
      request: () => ({
        orgId: store.orgId(),
        currentUser: store.appStore.currentUser()
      }),  
      loader: ({request}) => {
        const org$ = readModel<OrgModel>(store.appStore.firestore, OrgCollection, request.orgId);
        debugItemLoaded<OrgModel>(`org ${request.orgId}`, org$, request.currentUser);
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
      request: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      loader: ({request}) => {
        const mcat$ = readModel<CategoryListModel>(store.appStore.firestore, CategoryCollection, request.mcatId);
        debugItemLoaded<CategoryListModel>(`mcat ${request.mcatId}`, mcat$, store.appStore.currentUser());           
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

