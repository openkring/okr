import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { AppStore } from '@bk2/shared/feature';
import { BkModel, LogInfo, MembershipCollection, MembershipModel, ModelType, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared/models';

import { Observable, of } from 'rxjs';
import { compareDate, getAge, getEndOfYear, getFullPersonName, getSystemQuery, getYear, isMembership } from '@bk2/shared/util-core';
import { FirestoreService } from '@bk2/shared/data-access';

export type AocAdminOpsState = {
  modelType: ModelType | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocAdminOpsState = {
  modelType: undefined,
  log: [],
  logTitle: ''
};

export const AocAdminOpsStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService)
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

      listIban(modelType = ModelType.Person): void {
        console.log('AocAdminOpsStore.listIban: not yet implemented', modelType);
      },

      listJuniorsOlderThan(age = 18, orgKey = 'scs', refYear = getYear()): void {
        if (store.modelType() === ModelType.Membership) {
          const _log = store.data()
            .filter((model) => {
              if (isMembership(model, store.appStore.env.tenantId)) {
                if (model.membershipCategory === 'junior' && 
                    model.orgKey === orgKey &&
                    model.relIsLast === true &&
                    compareDate(model.dateOfExit, getEndOfYear() + '')
                ) { // we have all current juniors of the given org
                  // now we filter the ones that are older than the given age or have no dateOfBirth
                  const _age = getAge(model.memberDateOfBirth, false, refYear);
                  if (_age < 0 || _age > age) return true;
                }
              } 
              return false;
            })
            .map((model) => {
              if (isMembership(model, store.appStore.env.tenantId)) {
                const _name = getFullPersonName(model.memberName1, model.memberName2);
                const _age = getAge(model.memberDateOfBirth, false, refYear);
                const _message = _age < 0 ? 'no dateOfBirth' : `old junior: ${model.memberDateOfBirth} -> ${_age}`;
                if (_age < 0) return { id: model.bkey, name: _name, message: 'no dateOfBirth' };
                return { id: model.bkey, name: _name, message: _message };
              }
              return { id: model.bkey, name: '', message: 'not a membership ?' };
          });
          patchState(store, { log: _log, logTitle: 'old juniors' });
        }
      },

      updateMembershipPrices(): void {
        console.log('AocAdminOpsStore.updateMembershipPrices: not yet implemented');
      },

      updateMembershipAttributes(): void {
        console.log('AocAdminOpsStore.updateMembershipAttributes: not yet implemented');
      },

      checkJuniorEntry(): void {
        console.log('AocAdminOpsStore.checkJuniorEntry: not yet implemented');
      }
    }
  })
);
