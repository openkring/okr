import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { chipMatches, debugListLoaded, die, nameMatches } from '@bk2/shared/util-core';
import { AllCategories, ModelType, WorkingRelModel, WorkingRelType } from '@bk2/shared/models';
import { categoryMatches } from '@bk2/shared/categories';
import { AppStore } from '@bk2/shared/feature';

import { WorkingRelService } from '@bk2/relationship/working-rel/data-access';
import { WorkingRelModalsService } from './working-rel-modals.service';
import { WorkingRelNewModalComponent } from './working-rel-new.modal';
import { convertFormToNewWorkingRel, isWorkingRel, WorkingRelNewFormModel } from '@bk2/relationship/working-rel/util';
import { WorkingRelEditModalComponent } from './working-rel-edit.modal';

export type WorkingRelListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: WorkingRelType | typeof AllCategories;
  selectedState: number;
};

const initialState: WorkingRelListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: AllCategories,
  selectedState: AllCategories
};

export const WorkingRelListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    workingRelService: inject(WorkingRelService),
    workingRelModalsService: inject(WorkingRelModalsService),  
  })),
  withProps((store) => ({
    workingRelsResource: rxResource({
      stream: () => {        
        const workingRels$ = store.workingRelService.list();
        debugListLoaded('WorkingRelListStore.workingRels', workingRels$, store.appStore.currentUser());
        return workingRels$;
      }
    })
  })),

  withComputed((state) => {
    return {
      allWorkingRels: computed(() => state.workingRelsResource.value() ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson() ?? die('WorkingRelListStore:: current person not found')),
      currentOrg: computed(() => state.appStore.defaultOrg() ?? die('WorkingRelListStore: default org not found')),

      filteredWorkingRels: computed(() => {
        return state.workingRelsResource.value()?.filter((workingRel: WorkingRelModel) => 
          nameMatches(workingRel.index, state.searchTerm()) &&
          categoryMatches(workingRel.state, state.selectedState()) &&
          categoryMatches(workingRel.type, state.selectedType()) &&
          chipMatches(workingRel.tags, state.selectedTag()))
      }),
      isLoading: computed(() => state.workingRelsResource.isLoading()),
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

      setSelectedType(selectedType: number) {
        patchState(store, { selectedType });
      },

      setSelectedState(selectedState: number) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.WorkingRel);
      },

      /******************************** actions ******************************************* */
      /**
       * Show a modal to add a new workingRel.
       * @param subject first person to be related
       * @param object second person to be related
       */
      async add(): Promise<void> {
        const _subject = structuredClone(store.currentPerson() ?? await store.workingRelModalsService.selectPerson());
        const _object = structuredClone(store.currentOrg() ?? await store.workingRelModalsService.selectOrg());
        if (_subject && _object) {
          const _modal = await store.modalController.create({
            component: WorkingRelNewModalComponent,
            cssClass: 'small-modal',
            componentProps: {
              subject: _subject,
              object: _object,
              currentUser: store.appStore.currentUser()
            }
          });
          _modal.present();
          const { data, role } = await _modal.onDidDismiss();
          if (role === 'confirm') {
            const _workingRel = convertFormToNewWorkingRel(data as WorkingRelNewFormModel, store.appStore.tenantId());
            await store.workingRelService.create(_workingRel, store.appStore.tenantId(), store.appStore.currentUser());
            store.workingRelsResource.reload();
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`WorkingRelListStore.export(${type}) is not yet implemented.`);
      },

      /**
       * Show a modal to edit an existing workingRel.
       * @param workingRel the workingRel to edit
       */
      async edit(workingRel?: WorkingRelModel): Promise<void> {
        let _workingRel = workingRel;
        _workingRel ??= new WorkingRelModel(store.appStore.tenantId());
        
        const _modal = await store.modalController.create({
          component: WorkingRelEditModalComponent,
          componentProps: {
            workingRel: _workingRel,
            currentUser: store.appStore.currentUser(),
          }
        });
        _modal.present();
        await _modal.onWillDismiss();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isWorkingRel(data, store.appStore.tenantId())) {
            await (!data.bkey ? 
              store.workingRelService.create(data, store.appStore.tenantId(), store.appStore.currentUser()) : 
              store.workingRelService.update(data, store.appStore.currentUser()));
            store.workingRelsResource.reload();
          }
        }  
      },

      async end(workingRel?: WorkingRelModel): Promise<void> {
        if (workingRel) {
          await store.workingRelModalsService.end(workingRel);
          store.workingRelsResource.reload();  
        }
      },

      async delete(workingRel?: WorkingRelModel): Promise<void> {
        if (workingRel) {
          await store.workingRelService.delete(workingRel, store.appStore.currentUser());
          store.workingRelsResource.reload();  
        }
      },
    }
  }),
);
