import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { PersonalRelModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, isPersonalRel, nameMatches } from '@bk2/shared-util-core';

import { PersonalRelService } from '@bk2/relationship-personal-rel-data-access';
import { convertFormToNewPersonalRel, PersonalRelNewFormModel } from '@bk2/relationship-personal-rel-util';

import { PersonalRelEditModalComponent } from './personal-rel-edit.modal';
import { PersonalRelModalsService } from './personal-rel-modals.service';
import { PersonalRelNewModalComponent } from './personal-rel-new.modal';

export type PersonalRelListState = {
  searchTerm: string;
  selectedTag: string;
  selectedPersonalRelType: string;
};

const initialState: PersonalRelListState = {
  searchTerm: '',
  selectedTag: '',
  selectedPersonalRelType: 'all',
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
          nameMatches(personalRel.type, state.selectedPersonalRelType()) &&
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

      setSelectedPersonalRelType(selectedPersonalRelType: string) {
        patchState(store, { selectedPersonalRelType });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('personalrel');
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        const subject = structuredClone(store.appStore.currentPerson() ?? await store.personalRelModalsService.selectPerson());
        const object = structuredClone(store.appStore.currentPerson() ?? await store.personalRelModalsService.selectPerson());
        if (subject && object) {
          const modal = await store.modalController.create({
            component: PersonalRelNewModalComponent,
            cssClass: 'small-modal',
            componentProps: {
              subject: subject,
              object: object,
              currentUser: store.appStore.currentUser(),
              readOnly: readOnly
            }
          });
          modal.present();
          const { data, role } = await modal.onDidDismiss();
          if (role === 'confirm') {
            const personalRel = convertFormToNewPersonalRel(data as PersonalRelNewFormModel, store.appStore.tenantId());
            await store.personalRelService.create(personalRel, store.appStore.currentUser());
          }
        }
        store.personalRelsResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`PersonalRelListStore.export(${type}) is not yet implemented.`);
      },

      async edit(personalRel?: PersonalRelModel, readOnly = true): Promise<void> {
        personalRel ??= new PersonalRelModel(store.appStore.tenantId());
        
        const modal = await store.modalController.create({
          component: PersonalRelEditModalComponent,
          componentProps: {
            personalRel: personalRel,
            currentUser: store.appStore.currentUser(),
            readOnly: readOnly
          }
        });
        modal.present();
        await modal.onWillDismiss();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm') {
          if (isPersonalRel(data, store.appStore.tenantId())) {
            await (!data.bkey ? 
              store.personalRelService.create(data, store.appStore.currentUser()) : 
              store.personalRelService.update(data, store.appStore.currentUser()));
          }
        }
        store.personalRelsResource.reload();      },

      async end(personalRel?: PersonalRelModel, readOnly = true): Promise<void> {
        if (!readOnly && personalRel) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          await store.personalRelService.endPersonalRelByDate(personalRel, convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          store.personalRelsResource.reload();  
        }
      },

      async delete(personalRel?: PersonalRelModel, readOnly = true): Promise<void> {
        if (!readOnly && personalRel) {
          await store.personalRelService.delete(personalRel, store.appStore.currentUser());
          store.personalRelsResource.reload();  
        }
      },
    }
  }),
);
