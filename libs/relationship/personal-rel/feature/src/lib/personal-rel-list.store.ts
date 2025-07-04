import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, isPersonalRel, nameMatches } from '@bk2/shared/util-core';
import { AllCategories, ModelType, PersonalRelModel, PersonalRelType } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';
import { categoryMatches } from '@bk2/shared/categories';
import { selectDate } from '@bk2/shared/ui';

import { PersonalRelService } from '@bk2/personal-rel/data-access';
import { PersonalRelModalsService } from './personal-rel-modals.service';
import { PersonalRelEditModalComponent } from './personal-rel-edit.modal';
import { PersonalRelNewModalComponent } from './personal-rel-new.modal';
import { convertFormToNewPersonalRel, PersonalRelNewFormModel } from '@bk2/personal-rel/util';

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
    modalController: inject(ModalController),
    personalRelService: inject(PersonalRelService),
    personalRelModalsService: inject(PersonalRelModalsService),
  })),
  withProps((store) => ({
    personalRelsResource: rxResource({
      stream: () => {
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
        const _subject = structuredClone(store.appStore.currentPerson() ?? await store.personalRelModalsService.selectPerson());
        const _object = structuredClone(store.appStore.currentPerson() ?? await store.personalRelModalsService.selectPerson());
        if (_subject && _object) {
          const _modal = await store.modalController.create({
            component: PersonalRelNewModalComponent,
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
            const _personalRel = convertFormToNewPersonalRel(data as PersonalRelNewFormModel, store.appStore.tenantId());
            await store.personalRelService.create(_personalRel, store.appStore.currentUser());
          }
        }
        store.personalRelsResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`PersonalRelListStore.export(${type}) is not yet implemented.`);
      },

      async edit(personalRel?: PersonalRelModel): Promise<void> {
        let _personalRel = personalRel;
        _personalRel ??= new PersonalRelModel(store.appStore.tenantId());
        
        const _modal = await store.modalController.create({
          component: PersonalRelEditModalComponent,
          componentProps: {
            personalRel: _personalRel,
            currentUser: store.appStore.currentUser()
          }
        });
        _modal.present();
        await _modal.onWillDismiss();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isPersonalRel(data, store.appStore.tenantId())) {
            await (!data.bkey ? 
              store.personalRelService.create(data, store.appStore.currentUser()) : 
              store.personalRelService.update(data, store.appStore.currentUser()));
          }
        }
        store.personalRelsResource.reload();      },

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
          await store.personalRelService.delete(personalRel, store.appStore.currentUser());
          store.personalRelsResource.reload();  
        }
      },
    }
  }),
);
