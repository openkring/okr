import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { WorkingRelModel } from '@bk2/shared-models';
import { confirm } from '@bk2/shared-util-angular';
import { debugListLoaded, isValidAt } from '@bk2/shared-util-core';

import { AvatarService } from '@bk2/avatar-data-access';
import { WorkingRelService } from '@bk2/relationship-working-rel-data-access';
import { convertFormToNewWorkingRel, isWorkingRel, WorkingRelFormModel } from '@bk2/relationship-working-rel-util';

import { WorkingRelEditModalComponent } from './working-rel-edit.modal';
import { WorkingRelModalsService } from './working-rel-modals.service';
import { WorkingRelNewModalComponent } from 'libs/relationship/working-rel/feature/src/lib/working-rel-new.modal';

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
    workingRelModalsService: inject(WorkingRelModalsService),
    avatarService: inject(AvatarService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController)
  })),
  withProps((store) => ({
    workingRelsResource: rxResource({
      params: () => ({
        personKey: store.personKey(),
      }),
      stream: ({ params }) => {
        let workingRels$: Observable<WorkingRelModel[]> = of([]);
        if (params.personKey) {
          workingRels$ = store.workingRelService.listWorkingRelsOfPerson(params.personKey);
        }
        debugListLoaded('WorkingRelAccordionStore.workingRels of person', workingRels$, store.appStore.currentUser());
        return workingRels$;
      }
    }),
    workersResource: rxResource({
      params: () => ({
        orgKey: store.orgKey(),
      }),
      stream: ({ params }) => {
        let workers$: Observable<WorkingRelModel[]> = of([]);
        if (params.orgKey) {
          workers$ = store.workingRelService.listWorkersOfOrg(params.orgKey);
        }
        debugListLoaded('WorkingRelAccordionStore.workers of org', workers$, store.appStore.currentUser());
        return workers$;
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
      /**
       * Show a modal to add a new workRel.
       */
      async add(): Promise<void> {
        const person = structuredClone(store.appStore.currentPerson() ?? await store.workingRelModalsService.selectPerson());
        const org = structuredClone(store.appStore.defaultOrg() ?? await store.workingRelModalsService.selectOrg());
        if (person && org) {
          const modal = await store.modalController.create({
            component: WorkingRelNewModalComponent,
            cssClass: 'small-modal',
            componentProps: {
              subject: person,
              object: org,
              currentUser: store.appStore.currentUser()
            }
          });
          modal.present();
          const { data, role } = await modal.onDidDismiss();
          if (role === 'confirm') {
            const workRel = convertFormToNewWorkingRel(data as WorkingRelFormModel, store.appStore.tenantId());
            await store.workingRelService.create(workRel, store.appStore.currentUser());
          }
        }
        store.workingRelsResource.reload();
      },

      /**
       * Show a modal to edit an existing work relationship.
       * @param workRel the work relationship to edit
       */
      async edit(workRel?: WorkingRelModel): Promise<void> {
        let _workRel = workRel;
        _workRel ??= new WorkingRelModel(store.appStore.tenantId());

        const modal = await store.modalController.create({
          component: WorkingRelEditModalComponent,
          componentProps: {
            workingRel: _workRel,
            currentUser: store.appStore.currentUser(),
          }
        });
        modal.present();
        await modal.onWillDismiss();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm') {
          if (isWorkingRel(data, store.appStore.tenantId())) {
            await (!data.bkey ?
              store.workingRelService.create(data, store.appStore.currentUser()) :
              store.workingRelService.update(data, store.appStore.currentUser()));
            store.workingRelsResource.reload();
          }
        }
      },

      async end(workRel?: WorkingRelModel): Promise<void> {
        if (workRel) {
          await store.workingRelModalsService.end(workRel);
          store.workingRelsResource.reload();
        }
      },

      async delete(workingRel?: WorkingRelModel): Promise<void> {
        if (workingRel) {
          const result = await confirm(store.alertController, '@workingRel.operation.delete.confirm', true);
          if (result === true) {
            await store.workingRelService.delete(workingRel, store.appStore.currentUser());
            store.workingRelsResource.reload();
          }
        }
      }
    }
  })
);
