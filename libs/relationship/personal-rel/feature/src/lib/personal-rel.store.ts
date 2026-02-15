import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel, PersonalRelModel, PersonModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { confirm } from '@bk2/shared-util-angular';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, getTodayStr, isPersonalRel, isValidAt, nameMatches } from '@bk2/shared-util-core';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';

import { PersonalRelService } from '@bk2/relationship-personal-rel-data-access';

import { PersonalRelEditModalComponent } from './personal-rel-edit.modal';

export type PersonalRelState = {
  person: PersonModel | undefined;
  showOnlyCurrent: boolean;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedPersonalRelType: string;
};

const initialState: PersonalRelState = {
  searchTerm: '',
  selectedTag: '',
  selectedPersonalRelType: 'all',
  person: undefined,
  showOnlyCurrent: true,
};

export const PersonalRelStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    personalRelService: inject(PersonalRelService),
  })),
  withProps((store) => ({
    personalRelsResource: rxResource({
      params: () => ({
        person: store.person(),
      }),
      stream: ({params}) => {
        const personalRels$ = params.person ?
          store.personalRelService.listPersonalRelsOfPerson(params.person.bkey) :  
          store.personalRelService.list();        
        return personalRels$.pipe(
          debugListLoaded('PersonalRelStore.personalRels', store.appStore.currentUser())
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      allPersonalRels: computed(() => state.personalRelsResource.value() ?? []),
      currentPersonalRels: computed(() => state.personalRelsResource.value()?.filter(p => isValidAt(p.validFrom, p.validTo)) ?? []),
      personalRels: computed(() => state.showOnlyCurrent() ? state.personalRelsResource.value() ?? [] : state.personalRelsResource.value()?.filter(m => isValidAt(m.validFrom, m.validTo)) ?? []),  
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson() ?? die('PersonalRelStore:: current person not found')),
      tenantId: computed(() => state.appStore.tenantId()),

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
      reset() {
        patchState(store, initialState);
        store.personalRelsResource.reload();
      },

      reload() {
        store.personalRelsResource.reload();
      },

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

      setPerson(person: PersonModel) {
        patchState(store, { person });
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** getters ******************************************* */
      getTags(tagName = 'personalrel'): string {
        return store.appStore.getTags(tagName);
      },

      getTypes(typeName = 'personalrel_type'): CategoryListModel {
        return store.appStore.getCategory(typeName);
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const person = store.person();
        if (!person) return;
        const newPersonalRel = new PersonalRelModel(store.tenantId());
        newPersonalRel.subjectKey = person.bkey;
        newPersonalRel.subjectFirstName = person.firstName;
        newPersonalRel.subjectLastName = person.lastName;
        newPersonalRel.subjectGender = person.gender;

        newPersonalRel.objectKey = person.bkey;
        newPersonalRel.objectFirstName = person.firstName;
        newPersonalRel.objectLastName = person.lastName;
        newPersonalRel.objectGender = person.gender;

        newPersonalRel.type = 'partner';
        newPersonalRel.validFrom = getTodayStr();
        newPersonalRel.validTo = END_FUTURE_DATE_STR;
        await this.edit(newPersonalRel, readOnly);
      },

      /**
       * Show a modal to edit an existing personal relationship.
       * @param personalRel the personal relationship to edit
       */
      async edit(personalRel: PersonalRelModel, readOnly = true): Promise<void> {        
        const modal = await store.modalController.create({
          component: PersonalRelEditModalComponent,
          componentProps: {
            personalRel,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            types: this.getTypes(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isPersonalRel(data, store.tenantId())) {
            await (!data.bkey ? 
              store.personalRelService.create(data, store.currentUser()) : 
              store.personalRelService.update(data, store.currentUser()));
            this.reload();
          }
        }
      },

      async end(personalRel?: PersonalRelModel, readOnly = true): Promise<void> {
        if (!readOnly && personalRel) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          await store.personalRelService.endPersonalRelByDate(personalRel, convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          this.reload();  
        }
      },

      async delete(personalRel?: PersonalRelModel, readOnly = true): Promise<void> {
        if (!readOnly && personalRel) {
          const result = await confirm(store.alertController, '@personalRel.operation.delete.confirm', true);
          if (result === true) {
            await store.personalRelService.delete(personalRel, store.currentUser());
            this.reload();
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`PersonalRelStore.export(${type}) is not yet implemented.`);
      },
    }
  }),
);
