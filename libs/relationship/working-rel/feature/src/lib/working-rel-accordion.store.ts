import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared/config';
import { WorkingRelModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/auth/feature';
import { debugListLoaded, isValidAt } from '@bk2/shared/util';
import { AvatarService } from '@bk2/avatar/data-access';
import { confirm } from '@bk2/shared/i18n';
import { WorkingRelService } from '@bk2/working-rel/data-access';

export type WorkingRelAccordionState = {
  personKey: string | undefined;
  orgKey: string | undefined;
  showOnlyCurrent: boolean;
};

const initialState: WorkingRelAccordionState = {
  personKey: undefined,
  orgKey: undefined,
  showOnlyCurrent: true,
};

/** 
 * This store can be used for working relationship accordions.
 */
export const WorkingRelAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    workingRelService: inject(WorkingRelService),
    avatarService: inject(AvatarService),
    appStore: inject(AppStore),
    env: inject(ENV),
    modalController: inject(ModalController),
    alertController: inject(AlertController)
  })),
  withProps((store) => ({
     workingRelsResource: rxResource({
      request: () => ({
        personKey: store.personKey(),
      }),
      loader: ({request}) => {
        let _workingRels$: Observable<WorkingRelModel[]> = of([]);
        if (request.personKey) {
          _workingRels$ = store.workingRelService.listWorkingRelsOfPerson(request.personKey);
        }
        debugListLoaded('WorkingRelAccordionStore.workingRels of person', _workingRels$, store.appStore.currentUser());
        return _workingRels$;
      }
    }),
    workersResource: rxResource({
      request: () => ({
        orgKey: store.orgKey(),
      }),
      loader: ({request}) => {
        let _workers$: Observable<WorkingRelModel[]> = of([]);
        if (request.orgKey) {
          _workers$ = store.workingRelService.listWorkersOfOrg(request.orgKey);
        }
        debugListLoaded('WorkingRelAccordionStore.workers of org', _workers$, store.appStore.currentUser());
        return _workers$;
      }
    })
  })),

  withComputed((state) => {
    return {
      allWorkingRels: computed(() => state.workingRelsResource.value() ?? []),
      currentWorkingRels: computed(() => state.workingRelsResource.value()?.filter(p => isValidAt(p.validFrom, p.validTo)) ?? []),
      workingRels: computed(() => state.showOnlyCurrent() ? state.workingRelsResource.value() ?? [] : state.workingRelsResource.value()?.filter(m => isValidAt(m.validFrom, m.validTo)) ?? []),  
      currentUser: computed(() => state.appStore.currentUser()),
      allWorkers: computed(() => state.workersResource.value() ?? []),
      currentWorkers: computed(() => state.workersResource.value()?.filter(p => isValidAt(p.validFrom, p.validTo)) ?? []),
      workers: computed(() => state.showOnlyCurrent() ? state.workersResource.value() ?? [] : state.workersResource.value()?.filter(m => isValidAt(m.validFrom, m.validTo)) ?? []),  
      isLoading: computed(() => state.workingRelsResource.isLoading() || state.workersResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters ******************************************* */
      setPersonKey(personKey: string) {
        patchState(store, { personKey, orgKey: undefined });
        store.workingRelsResource.reload();
      },

      setOrgKey(orgKey: string) {
        patchState(store, { orgKey, personKey: undefined });
        store.workingRelsResource.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** actions ******************************************* */
      async edit(workingRel?: WorkingRelModel): Promise<void> {
        await store.workingRelService.edit(workingRel);
        store.workingRelsResource.reload();
      },

      async end(workingRel?: WorkingRelModel): Promise<void> {
        if (workingRel) {
          await store.workingRelService.end(workingRel);
          store.workingRelsResource.reload();  
        }
      },

      async delete(workingRel?: WorkingRelModel): Promise<void> {
        if (workingRel) {
          const _result = await confirm(store.alertController, '@workingRel.operation.delete.confirm', true);
          if (_result === true) {
            await store.workingRelService.delete(workingRel);
            store.workingRelsResource.reload();
          } 
        }
      }
    }
  })
);
