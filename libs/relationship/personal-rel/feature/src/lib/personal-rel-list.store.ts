import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared/config';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, nameMatches } from '@bk2/shared/util';
import { AllCategories, ModelType, PersonalRelModel, PersonalRelType } from '@bk2/shared/models';

import { AppStore } from '@bk2/auth/feature';

import { PersonalRelService } from '@bk2/personal-rel/data-access';
import { categoryMatches } from '@bk2/shared/categories';
import { selectDate } from '@bk2/shared/ui';
import { PersonalRelModalsService } from './personal-rel-modals.service';

export type PersonalRelListState = {
  searchTerm: string;
  selectedTag: string;
  selectedPersonalRelType: PersonalRelType | typeof AllCategories;
};

const initialState: PersonalRelListState = {
  searchTerm: '',
  selectedTag: '',
  selectedPersonalRelType: AllCategories,
};

export const PersonalRelListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    env: inject(ENV),
    modalController: inject(ModalController),
    personalRelService: inject(PersonalRelService),
    personalRelModalsService: inject(PersonalRelModalsService),
  })),
  withProps((store) => ({
    personalRelsResource: rxResource({
      loader: () => {
        const personalRels$ = store.personalRelService.list();        
        debugListLoaded('PersonalRelListStore.personalRels', personalRels$, store.appStore.currentUser());
        return personalRels$;
      }
    })
  })),

  withComputed((state) => {
    return {
      allPersonalRels: computed(() => state.personalRelsResource.value() ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson() ?? die('PersonalRelListStore:: current person not found')),

      filteredPersonalRels: computed(() => {
        return state.personalRelsResource.value()?.filter((personalRel: PersonalRelModel) => 
          nameMatches(personalRel.index, state.searchTerm()) &&
          categoryMatches(personalRel.type, state.selectedPersonalRelType()) &&
          chipMatches(personalRel.tags, state.selectedTag()))
      }),
      isLoading: computed(() => state.personalRelsResource.isLoading()),
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

      setSelectedPersonalRelType(selectedPersonalRelType: number) {
        patchState(store, { selectedPersonalRelType });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.PersonalRel);
      },

      /******************************** actions ******************************************* */
      async add(): Promise<void> {
        await store.personalRelModalsService.add(store.currentPerson(), store.currentPerson());
        store.personalRelsResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`PersonalRelListStore.export(${type}) is not yet implemented.`);
      },

      async edit(personalRel?: PersonalRelModel): Promise<void> {
        await store.personalRelModalsService.edit(personalRel);
        store.personalRelsResource.reload();
      },

      async end(personalRel?: PersonalRelModel): Promise<void> {
        if (personalRel) {
          const _date = await selectDate(store.modalController);
          if (!_date) return;
          await store.personalRelService.endPersonalRelByDate(personalRel, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          store.personalRelsResource.reload();  
        }
      },

      async delete(personalRel?: PersonalRelModel): Promise<void> {
        if (personalRel) {
          await store.personalRelService.delete(personalRel);
          store.personalRelsResource.reload();  
        }
      },
    }
  }),
);
