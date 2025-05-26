import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { CategoryCollection, CategoryListModel, MembershipModel, ModelType, OrgCollection, OrgModel } from '@bk2/shared/models';
import { debugItemLoaded, readModel } from '@bk2/shared/util';

import { AppStore } from '@bk2/auth/feature';

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
    firestore: inject(FIRESTORE),
    env: inject(ENV),
    modalController: inject(ModalController) 
  })),
  withProps((store) => ({
    orgResource: rxResource({
      request: () => ({
        orgId: store.membership()?.orgKey,
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
      orgId: computed(() => state.membership()?.orgKey ?? ''),
      org: computed(() => state.orgResource.value() ?? undefined),
      membershipCategoryKey: computed(() => `mcat_${state.membership()?.orgKey}`)
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

