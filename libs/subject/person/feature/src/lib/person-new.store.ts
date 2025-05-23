import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { CategoryCollection, CategoryListModel, getDefaultMembershipCategory, ModelType, OrgCollection, OrgModel } from '@bk2/shared/models';
import { readModel } from '@bk2/shared/data';
import { AppStore } from '@bk2/auth/feature';
import { debugItemLoaded } from '@bk2/shared/util';

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
    firestore: inject(FIRESTORE),
    env: inject(ENV),
    modalController: inject(ModalController) 
  })),

  withProps((store) => ({
    orgResource: rxResource({
      request: () => ({
        orgId: store.orgId(),
        currentUser: store.appStore.currentUser()
      }),  
      loader: ({request}) => {
        const org$ = readModel<OrgModel>(store.firestore, OrgCollection, request.orgId);
        debugItemLoaded<OrgModel>(`org ${request.orgId}`, org$, request.currentUser);
        return org$;
      }
    })
  })),

  withComputed((state) => {
    return {
      org: computed(() => state.orgResource.value() ?? undefined),
      membershipCategoryKey: computed(() => `mcat_${state.orgId()}`),
    };
  }),
  withProps((store) => ({
    mcatResource: rxResource({
      request: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      loader: ({request}) => {
        const mcat$ = readModel<CategoryListModel>(store.firestore, CategoryCollection, request.mcatId);
        debugItemLoaded<CategoryListModel>(`mcat ${request.mcatId}`, mcat$, store.appStore.currentUser());           
        return mcat$;
      }
    })
  })),
  withComputed((state) => {
    return {
      membershipCategory: computed(() => state.mcatResource.value() ?? getDefaultMembershipCategory(state.env.owner.tenantId)),
      currentUser: computed(() => state.appStore.currentUser()),
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
        orgId: store.env.owner.orgId 
      });
    }
  })
);

