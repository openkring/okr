import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryCollection, CategoryListModel, getDefaultMembershipCategory, OrgCollection, OrgModel } from '@bk2/shared-models';
import { debugItemLoaded } from '@bk2/shared-util-core';

import { MembershipService } from '@bk2/relationship-membership-data-access';

export type MembershipNewState = {
  orgId: string | undefined;
};

export const initialState: MembershipNewState = {
  orgId: undefined,
};

export const MembershipNewStore = signalStore(
  withState(initialState),

  withProps(() => ({
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
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
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.mcatResource.isLoading() || state.orgResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      setOrgId(orgId: string) {
        patchState(store, { orgId });
      }
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

