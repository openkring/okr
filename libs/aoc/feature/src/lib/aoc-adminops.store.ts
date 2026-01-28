import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, Observable, of, take } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressChannel, AddressCollection, AddressModel, BkModel, DbQuery, LogInfo, MembershipCollection, MembershipModel, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared-models';
import { compareDate, getAge, getEndOfYear, getFullName, getSystemQuery, getYear, isMembership } from '@bk2/shared-util-core';
import { getMembershipCategoryChanges } from '@bk2/relationship-membership-util';

export type AocAdminOpsState = {
  modelType: string | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocAdminOpsState = {
  modelType: undefined,
  log: [],
  logTitle: '',
};

export const AocAdminOpsStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
  })),
  withProps(store => ({
    dataResource: rxResource({
      params: () => ({
        modelType: store.modelType(),
      }),
      stream: ({ params }): Observable<BkModel[] | undefined> => {
        switch (params.modelType) {
          case 'person':
            return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.appStore.env.tenantId), 'lastName', 'asc');
          case 'org':
            return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(store.appStore.env.tenantId), 'name', 'asc');
          case 'membership':
            console.log('AocAdminOpsStore: loading memberships ...');
            return store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.env.tenantId), 'memberName2', 'asc');
          default:
            return of(undefined);
        }
      },
    }),
  })),

  withComputed(state => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.dataResource.isLoading()),
      data: computed(() => state.dataResource.value() ?? []),
    };
  }),

  withMethods(store => {
    return {
      /******************************** setters (filter) ******************************************* */
      setModelType(modelType: string | undefined): void {
        patchState(store, { modelType, log: [], logTitle: '' });
      },

      async listIban(): Promise<void> {
        const query = getSystemQuery(store.appStore.env.tenantId);
        query.push({ key: 'channelType', operator: '==', value: AddressChannel.BankAccount });
        store.firestoreService.searchData<AddressModel>( AddressCollection, query, 'none')
        .pipe(take(1))
        .subscribe((addresses) => {
          const log: LogInfo[] = [];
          addresses.forEach((address) => {
            const [modelType, pkey] = address.parentKey.split('.');
            let name = '';
            if (modelType === 'person') {
              const person = store.appStore.getPerson(pkey);
              name = getFullName(person?.firstName, person?.lastName);
            } else if (modelType === 'org') {
              const org = store.appStore.getOrg(pkey);
              name = org?.name || '';
            }
                log.push({ id: address.bkey, name: name, message: address.iban });
          });
          patchState(store, { log, logTitle: 'IBAN List' });
        }); 
      },

      listJuniorsOlderThan(age = 18, orgKey = 'scs', refYear = getYear()): void {
        if (store.modelType() === 'membership') {
          const log = store
            .data()
            .filter(model => {
              if (isMembership(model, store.appStore.env.tenantId)) {
                const m = model as MembershipModel;
                if (m.category === 'junior' && m.orgKey === orgKey && m.relIsLast === true && compareDate(m.dateOfExit, getEndOfYear() + '')) {
                  // we have all current juniors of the given org
                  // now we filter the ones that are older than the given age or have no dateOfBirth
                  const age = getAge(m.memberDateOfBirth, false, refYear);
                  if (age < 0 || age > age) return true;
                }
              }
              return false;
            })
            .map(model => {
              if (isMembership(model, store.appStore.env.tenantId)) {
                const m = model as MembershipModel;
                const name = getFullName(m.memberName1, m.memberName2);
                const age = getAge(m.memberDateOfBirth, false, refYear);
                const message = age < 0 ? 'no dateOfBirth' : `old junior: ${m.memberDateOfBirth} -> ${age}`;
                if (age < 0) return { id: m.bkey, name: name, message: 'no dateOfBirth' };
                return { id: m.bkey, name: name, message: message };
              }
              const m = model as BkModel;
              return { id: m.bkey, name: '', message: 'not a membership ?' };
            });
          patchState(store, { log: log, logTitle: 'old juniors' });
        } else {
          console.error('AocAdminOpsStore.listJuniorsOlderThan: modelType is not membership');
        }
      },

      async showMembershipCategoryChanges(club: string, year: number): Promise<void> {
        const log: LogInfo[] = [];

        // Wait for dataResource to finish loading
        while (store.dataResource.isLoading()) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise(res => setTimeout(res, 50));
        }
        if (store.modelType() === 'membership') {
          const changes = getMembershipCategoryChanges(store.data() as MembershipModel[], club, year);
          for (const change of changes) {
            log.push({ id: change.memberKey, name: getFullName(change.memberName1, change.memberName2), message: `${change.dateOfChange}: ${change.oldCategory} -> ${change.newCategory}` }); 
          }
          patchState(store, { log: log, logTitle: 'Änderungen der Mitgliederkategorie' });
        } else {
          console.error('AocAdminOpsStore.showMembershipCategoryChanges: modelType is not membership');
        }
      },
    };
  })
);
