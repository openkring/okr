import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { CategoryCollection, CategoryListModel, MembershipModel, ModelType, OrgCollection, OrgModel } from '@bk2/shared/models';
import { debugItemLoaded, readModel } from '@bk2/shared/util-core';

import { MembershipService } from '@bk2/membership/data-access';
import { AppStore } from '@bk2/shared/feature';

export type MembershipEditState = {
  membership: MembershipModel | undefined;
};

export const initialState: MembershipEditState = {
  membership: undefined,
};

export const MembershipEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
    modalController: inject(ModalController) 
  })),
  withProps((store) => ({
    orgResource: rxResource({
      params: () => ({
        orgId: store.membership()?.orgKey,
        currentUser: store.appStore.currentUser()
      }),  
      stream: ({params}) => {
        const org$ = readModel<OrgModel>(store.appStore.firestore, OrgCollection, params.orgId);
        debugItemLoaded<OrgModel>(`org ${params.orgId}`, org$, params.currentUser);
        return org$;
      }
    })
  })),

  withComputed((state) => {
    return {
      orgId: computed(() => state.membership()?.orgKey ?? ''),
      org: computed(() => state.orgResource.value() ?? undefined),
      membershipCategoryKey: computed(() => `mcat_${state.membership()?.orgKey}`)
    };
  }),
  withProps((store) => ({
    mcatResource: rxResource({
      params: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      stream: ({params}) => {
        const mcat$ = readModel<CategoryListModel>(store.appStore.firestore, CategoryCollection, params.mcatId);
        debugItemLoaded<CategoryListModel>(`mcat ${params.mcatId}`, mcat$, store.appStore.currentUser());           
        return mcat$;
      }
    })
  })),
  withComputed((state) => {
    return {
      membershipCategory: computed(() => state.mcatResource.value() ?? undefined),
      isLoading: computed(() => state.mcatResource.isLoading() || state.orgResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      /******************************** setters ******************************************* */
      setMembership(membership: MembershipModel) {
        patchState(store, { membership });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Membership);
      },
    };
  }),
);

