import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { FIRESTORE } from '@bk2/shared/config';
import { getSystemQuery, searchData } from '@bk2/shared/data';
import { AppStore } from '@bk2/auth/feature';
import { BkModel, LogInfo, MembershipCollection, MembershipModel, ModelType, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared/models';

import { Observable, of } from 'rxjs';

export type AocContentState = {
  modelType: ModelType | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocContentState = {
  modelType: undefined,
  log: [],
  logTitle: ''
};

export const AocContentStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestore: inject(FIRESTORE),
  })),
  withProps((store) => ({
    dataResource: rxResource({
      request: () => ({
        modelType: store.modelType()
      }),
      loader: ({request}): Observable<BkModel[] | undefined> => {
        switch(request.modelType) {
          case ModelType.Person:
            return searchData<PersonModel>(store.firestore, PersonCollection, getSystemQuery(store.appStore.env.owner.tenantId), 'lastName', 'asc');
          case ModelType.Org:
            return searchData<OrgModel>(store.firestore, OrgCollection, getSystemQuery(store.appStore.env.owner.tenantId), 'name', 'asc');
          case ModelType.Membership:
            return searchData<MembershipModel>(store.firestore, MembershipCollection, getSystemQuery(store.appStore.env.owner.tenantId), 'memberName2', 'asc');
          default:
            return of(undefined);
        }
      }
    })
  })),

  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.dataResource.isLoading()),
      data: computed(() => state.dataResource.value() ?? []),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
      setModelType(modelType: ModelType | undefined): void {
        patchState(store, { modelType, log: [], logTitle: '' });
      },

      findOrphanedSections(): void {
        console.log('AocContentStore.findOrphanedSections: not yet implemented');
      },

      findMissingSections(): void {
        console.log('AocContentStore.findMissingSections: not yet implemented');
      },

      findOrphanedMenus(): void {
        console.log('AocContentStore.findOrphanedMenus: not yet implemented');
      },

      findMissingMenus(): void {
        console.log('AocContentStore.findMissingMenus: not yet implemented');
      },

      checkLinks(): void {
        console.log('AocContentStore.checkLinks: not yet implemented');
      },
    }
  })
);
 
