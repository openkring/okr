import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';

import { AppStore } from '@bk2/shared/feature';
import { BkModel, LogInfo, MembershipCollection, MembershipModel, ModelType, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared/models';
import { getSystemQuery } from '@bk2/shared/util-core';
import { FirestoreService } from '@bk2/shared/data-access';

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
    firestoreService: inject(FirestoreService),
  })),
  withProps((store) => ({
    dataResource: rxResource({
      params: () => ({
        modelType: store.modelType()
      }),
      stream: ({params}): Observable<BkModel[] | undefined> => {
        switch(params.modelType) {
          case ModelType.Person:
            return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.appStore.env.tenantId), 'lastName', 'asc');
          case ModelType.Org:
            return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(store.appStore.env.tenantId), 'name', 'asc');
          case ModelType.Membership:
            return store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.env.tenantId), 'memberName2', 'asc');
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
 
