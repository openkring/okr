import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { WorkrelModel } from '@bk2/shared-models';
import { confirm } from '@bk2/shared-util-angular';
import { debugListLoaded, isValidAt } from '@bk2/shared-util-core';

import { AvatarService } from '@bk2/avatar-data-access';
import { WorkrelService } from '@bk2/relationship-workrel-data-access';
import { convertFormToNewWorkrel, isWorkrel, WorkrelFormModel } from '@bk2/relationship-workrel-util';

import { WorkrelEditModalComponent } from './workrel-edit.modal';
import { WorkrelModalsService } from './workrel-modals.service';
import { WorkrelNewModalComponent } from 'libs/relationship/workrel/feature/src/lib/workrel-new.modal';

export type WorkrelAccordionState = {
  personKey: string | undefined;
  orgKey: string | undefined;
  showOnlyCurrent: boolean;
};

const initialState: WorkrelAccordionState = {
  personKey: undefined,
  orgKey: undefined,
  showOnlyCurrent: true,
};

/** 
 * This store can be used for work relationship accordions.
 */
export const WorkrelAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    workrelService: inject(WorkrelService),
    workrelModalsService: inject(WorkrelModalsService),
    avatarService: inject(AvatarService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController)
  })),
  withProps((store) => ({
    workrelsResource: rxResource({
      params: () => ({
        personKey: store.personKey(),
      }),
      stream: ({ params }) => {
        let workrels$: Observable<WorkrelModel[]> = of([]);
        if (params.personKey) {
          workrels$ = store.workrelService.listWorkrelsOfPerson(params.personKey);
        }
        debugListLoaded('WorkrelAccordionStore.workrels of person', workrels$, store.appStore.currentUser());
        return workrels$;
      }
    }),
    workersResource: rxResource({
      params: () => ({
        orgKey: store.orgKey(),
      }),
      stream: ({ params }) => {
        let workers$: Observable<WorkrelModel[]> = of([]);
        if (params.orgKey) {
          workers$ = store.workrelService.listWorkersOfOrg(params.orgKey);
        }
        debugListLoaded('WorkrelAccordionStore.workers of org', workers$, store.appStore.currentUser());
        return workers$;
      }
    })
  })),

  withComputed((state) => {
    return {
      allWorkrels: computed(() => state.workrelsResource.value() ?? []),
      currentWorkrels: computed(() => state.workrelsResource.value()?.filter(p => isValidAt(p.validFrom, p.validTo)) ?? []),
      workrels: computed(() => state.showOnlyCurrent() ? state.workrelsResource.value() ?? [] : state.workrelsResource.value()?.filter(m => isValidAt(m.validFrom, m.validTo)) ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      allWorkers: computed(() => state.workersResource.value() ?? []),
      currentWorkers: computed(() => state.workersResource.value()?.filter(p => isValidAt(p.validFrom, p.validTo)) ?? []),
      workers: computed(() => state.showOnlyCurrent() ? state.workersResource.value() ?? [] : state.workersResource.value()?.filter(m => isValidAt(m.validFrom, m.validTo)) ?? []),
      isLoading: computed(() => state.workrelsResource.isLoading() || state.workersResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters ******************************************* */
      setPersonKey(personKey: string) {
        patchState(store, { personKey, orgKey: undefined });
        store.workrelsResource.reload();
      },

      setOrgKey(orgKey: string) {
        patchState(store, { orgKey, personKey: undefined });
        store.workrelsResource.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** actions ******************************************* */
      /**
       * Show a modal to add a new workRel.
       */
      async add(readOnly = true): Promise<void> {
        if(readOnly === false) {
          const person = structuredClone(store.appStore.currentPerson() ?? await store.workrelModalsService.selectPerson());
          const org = structuredClone(store.appStore.defaultOrg() ?? await store.workrelModalsService.selectOrg());
          if (person && org) {
            const modal = await store.modalController.create({
              component: WorkrelNewModalComponent,
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
              const workRel = convertFormToNewWorkrel(data as WorkrelFormModel, store.appStore.tenantId());
              await store.workrelService.create(workRel, store.appStore.currentUser());
            }
          }
          store.workrelsResource.reload();
        }
      },

      /**
       * Show a modal to edit an existing work relationship.
       * @param workRel the work relationship to edit
       */
      async edit(workRel?: WorkrelModel, readOnly = true): Promise<void> {
        let _workRel = workRel;
        _workRel ??= new WorkrelModel(store.appStore.tenantId());

        const modal = await store.modalController.create({
          component: WorkrelEditModalComponent,
          componentProps: {
            workrel: _workRel,
            currentUser: store.appStore.currentUser(),
            readOnly
          }
        });
        modal.present();
        await modal.onWillDismiss();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && !readOnly) {
          if (isWorkrel(data, store.appStore.tenantId())) {
            await (!data.bkey ?
              store.workrelService.create(data, store.appStore.currentUser()) :
              store.workrelService.update(data, store.appStore.currentUser()));
            store.workrelsResource.reload();
          }
        }
      },

      async end(workRel?: WorkrelModel, readOnly = true): Promise<void> {
        if (workRel && !readOnly) {
          await store.workrelModalsService.end(workRel);
          store.workrelsResource.reload();
        }
      },

      async delete(workrel?: WorkrelModel, readOnly = true): Promise<void> {
        if (workrel && !readOnly) {
          const result = await confirm(store.alertController, '@workrel.operation.delete.confirm', true);
          if (result === true) {
            await store.workrelService.delete(workrel, store.appStore.currentUser());
            store.workrelsResource.reload();
          }
        }
      }
    }
  })
);
