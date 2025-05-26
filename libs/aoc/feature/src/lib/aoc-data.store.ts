import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { FIRESTORE } from '@bk2/shared/config';
import { getSystemQuery, searchData } from '@bk2/shared/data-access';
import { AppStore } from '@bk2/auth/feature';
import { BkModel, LogInfo, MembershipCollection, MembershipModel, ModelType, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared/models';

import { Observable, of } from 'rxjs';

export type AocDataState = {
  modelType: ModelType | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocDataState = {
  modelType: undefined,
  log: [],
  logTitle: ''
};

export const AocDataStore = signalStore(
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

      /**
       * Fix models of a given type. THIS CHANGES MANY DATA IN THE DATABASE.
       * The purpose of this function is to apply corrections as a bulk operation over all models of a given type.
       * The function is normally called once and then new logic is implemented for the next correction.
       * That's why we only keep one single function that is used for all models.
       * To test your fix function, disable the update call.
       */
      async fixModels(): Promise<void> {
        console.log('AocDataStore.fixModels: not yet implemented');
      },

      /**
       * Validate models of a given type. This checks the data in one collection of the database whether it is valid.
       */
      async validateModels(): Promise<void> {
        console.log('AocDataStore.validateModels: not yet implemented');
      }
    }
  })
);
 
