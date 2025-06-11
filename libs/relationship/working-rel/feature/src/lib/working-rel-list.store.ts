import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared/config';
import { chipMatches, debugListLoaded, die, nameMatches } from '@bk2/shared/util';
import { AllCategories, ModelType, WorkingRelModel, WorkingRelType } from '@bk2/shared/models';
import { categoryMatches } from '@bk2/shared/categories';

import { AppStore } from '@bk2/auth/feature';

import { WorkingRelService } from '@bk2/working-rel/data-access';
import { WorkingRelModalsService } from './working-rel-modals.service';

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
    env: inject(ENV),
    modalController: inject(ModalController),
    workingRelService: inject(WorkingRelService),
    workingRelModalsService: inject(WorkingRelModalsService),  
  })),
  withProps((store) => ({
    workingRelsResource: rxResource({
      loader: () => {        
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
      async add(): Promise<void> {
        await store.workingRelModalsService.add(store.currentPerson(), store.currentOrg());
        store.workingRelsResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`WorkingRelListStore.export(${type}) is not yet implemented.`);
      },

      async edit(workingRel?: WorkingRelModel): Promise<void> {
        await store.workingRelModalsService.edit(workingRel);
        store.workingRelsResource.reload();
      },

      async end(workingRel?: WorkingRelModel): Promise<void> {
        if (workingRel) {
          await store.workingRelModalsService.end(workingRel);
          store.workingRelsResource.reload();  
        }
      },

      async delete(workingRel?: WorkingRelModel): Promise<void> {
        if (workingRel) {
          await store.workingRelService.delete(workingRel);
          store.workingRelsResource.reload();  
        }
      },
    }
  }),
);
