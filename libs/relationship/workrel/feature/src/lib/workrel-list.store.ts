import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { WorkrelModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, die, nameMatches } from '@bk2/shared-util-core';

import { WorkrelService } from '@bk2/relationship-workrel-data-access';
import { convertFormToNewWorkrel, isWorkrel, WorkrelNewFormModel } from '@bk2/relationship-workrel-util';

import { WorkrelEditModalComponent } from './workrel-edit.modal';
import { WorkrelModalsService } from './workrel-modals.service';
import { WorkrelNewModalComponent } from './workrel-new.modal';

export type WorkrelListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedState: string;
};

const initialState: WorkrelListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedState: 'all'
};

export const WorkrelListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    workrelService: inject(WorkrelService),
    workrelModalsService: inject(WorkrelModalsService),
  })),
  withProps((store) => ({
    workrelsResource: rxResource({
      stream: () => {
        const workrels$ = store.workrelService.list();
        debugListLoaded('WorkrelListStore.workrels', workrels$, store.appStore.currentUser());
        return workrels$;
      }
    })
  })),

  withComputed((state) => {
    return {
      allWorkrels: computed(() => state.workrelsResource.value() ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson() ?? die('WorkrelListStore:: current person not found')),
      currentOrg: computed(() => state.appStore.defaultOrg() ?? die('WorkrelListStore: default org not found')),

      filteredWorkrels: computed(() => {
        return state.workrelsResource.value()?.filter((workrel: WorkrelModel) =>
          nameMatches(workrel.index, state.searchTerm()) &&
          nameMatches(workrel.state, state.selectedState()) &&
          nameMatches(workrel.type, state.selectedType()) &&
          chipMatches(workrel.tags, state.selectedTag()))
      }),
      isLoading: computed(() => state.workrelsResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedType(selectedType: string) {
        patchState(store, { selectedType });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('workrel');
      },

      /******************************** actions ******************************************* */
      /**
       * Show a modal to add a new work relationship.
       * @param subject first person to be related
       * @param object second person to be related
       */
      async add(): Promise<void> {
        const subject = structuredClone(store.currentPerson() ?? await store.workrelModalsService.selectPerson());
        const object = structuredClone(store.currentOrg() ?? await store.workrelModalsService.selectOrg());
        if (subject && object) {
          const modal = await store.modalController.create({
            component: WorkrelNewModalComponent,
            cssClass: 'small-modal',
            componentProps: {
              subject: subject,
              object: object,
              currentUser: store.appStore.currentUser()
            }
          });
          modal.present();
          const { data, role } = await modal.onDidDismiss();
          if (role === 'confirm') {
            const workrel = convertFormToNewWorkrel(data as WorkrelNewFormModel, store.appStore.tenantId());
            await store.workrelService.create(workrel, store.appStore.currentUser());
            store.workrelsResource.reload();
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`WorkrelListStore.export(${type}) is not yet implemented.`);
      },

      /**
       * Show a modal to edit an existing work relationship.
       * @param workrel the work relationship to edit
       */
      async edit(workrel?: WorkrelModel): Promise<void> {
        let _workrel = workrel;
        workrel ??= new WorkrelModel(store.appStore.tenantId());

        const modal = await store.modalController.create({
          component: WorkrelEditModalComponent,
          componentProps: {
            workrel: _workrel,
            currentUser: store.appStore.currentUser(),
          }
        });
        modal.present();
        await modal.onWillDismiss();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm') {
          if (isWorkrel(data, store.appStore.tenantId())) {
            await (!data.bkey ?
              store.workrelService.create(data, store.appStore.currentUser()) :
              store.workrelService.update(data, store.appStore.currentUser()));
            store.workrelsResource.reload();
          }
        }
      },

      async end(workrel?: WorkrelModel): Promise<void> {
        if (workrel) {
          await store.workrelModalsService.end(workrel);
          store.workrelsResource.reload();
        }
      },

      async delete(workrel?: WorkrelModel): Promise<void> {
        if (workrel) {
          await store.workrelService.delete(workrel, store.appStore.currentUser());
          store.workrelsResource.reload();
        }
      },
    }
  }),
);
