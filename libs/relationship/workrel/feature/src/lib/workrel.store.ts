import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore, OrgSelectModalComponent, PersonSelectModalComponent } from '@bk2/shared-feature';
import { CategoryListModel, OrgModel, PersonModel, WorkrelModel } from '@bk2/shared-models';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, getTodayStr, isOrg, isPerson, isValidAt, nameMatches } from '@bk2/shared-util-core';
import { confirm } from '@bk2/shared-util-angular';

import { WorkrelService } from '@bk2/relationship-workrel-data-access';
import { isWorkrel } from '@bk2/relationship-workrel-util';

import { WorkrelEditModalComponent } from './workrel-edit.modal';
import { selectDate } from '@bk2/shared-ui';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { Observable, of } from 'rxjs';

export type WorkrelState = {
  personKey: string | undefined;    // parent e.g. in accordions
  orgKey: string | undefined;       // parent e.g. in accordions
  showOnlyCurrent: boolean;
  // filters
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedState: string;
};

const initialState: WorkrelState = {
  personKey: undefined,
  orgKey: undefined,
  showOnlyCurrent: true,
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedState: 'all',
};

export const WorkrelStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    workrelService: inject(WorkrelService),
  })),
  withProps((store) => ({
    workrelsResource: rxResource({
      params: () => ({
        personKey: store.personKey(),
      }),
      stream: ({params}) => {
        const workrels$ = params.personKey ? 
          store.workrelService.listWorkrelsOfPerson(params.personKey) : 
          store.workrelService.list();
        debugListLoaded('WorkrelStore.workrels of person', workrels$, store.appStore.currentUser());
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
        debugListLoaded('WorkrelStore.workers of org', workers$, store.appStore.currentUser());
        return workers$;
      }
    })
  })),

  withComputed((state) => {
    return {
      // workrels (person as parent)
      allWorkrels: computed(() => state.workrelsResource.value() ?? []),
      currentWorkrels: computed(() => state.workrelsResource.value()?.filter(p => isValidAt(p.validFrom, p.validTo)) ?? []),
      workrels: computed(() => state.showOnlyCurrent() ? state.workrelsResource.value() ?? [] : state.workrelsResource.value()?.filter(m => isValidAt(m.validFrom, m.validTo)) ?? []),

      // workers (org as parent)
      allWorkers: computed(() => state.workersResource.value() ?? []),
      currentWorkers: computed(() => state.workersResource.value()?.filter(p => isValidAt(p.validFrom, p.validTo)) ?? []),
      workers: computed(() => state.showOnlyCurrent() ? state.workersResource.value() ?? [] : state.workersResource.value()?.filter(m => isValidAt(m.validFrom, m.validTo)) ?? []),

      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson() ?? die('WorkrelStore:: current person not found')),
      currentOrg: computed(() => state.appStore.defaultOrg() ?? die('WorkrelStore: default org not found')),
      tenantId: computed(() => state.appStore.tenantId()),

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
      reset() {
        patchState(store, initialState);
        store.workrelsResource.reload();
      },

      reload() {
        store.workrelsResource.reload();
      },

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

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('workrel');
      },

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('workrel_type');
      },

      getStates(): CategoryListModel {
        return store.appStore.getCategory('workrel_state');
      },

      getPeriodicities(): CategoryListModel { 
        return store.appStore.getCategory('periodicity');
      },

      /******************************** actions ******************************************* */
      /**
       * Show a modal to add a new work relationship.
       * @param subject person that has a work relationship with an org
       * @param object org that has a work relationship with a person
       * tbd: consider an already existing personKey or orgKey to prefill the new workrel (means: personKey/orgKey need to be resolved to Person/OrgModel)
       */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const newWorkrel = new WorkrelModel(store.appStore.tenantId());
        newWorkrel.subjectKey = store.currentPerson().bkey;
        newWorkrel.subjectName1 = store.currentPerson().firstName;
        newWorkrel.subjectName2 = store.currentPerson().lastName;
        newWorkrel.subjectModelType = 'person';
        newWorkrel.subjectType = store.currentPerson().gender;

        newWorkrel.objectKey = store.currentOrg().bkey;
        newWorkrel.objectName = store.currentOrg().name;
        newWorkrel.objectType = store.currentOrg().type;

        newWorkrel.validFrom = getTodayStr();
        newWorkrel.validTo = END_FUTURE_DATE_STR;
        await this.edit(newWorkrel, readOnly);
      },

      /**
       * Show a modal to edit an existing work relationship.
       * @param workrel the work relationship to edit
       */
      async edit(workrel: WorkrelModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: WorkrelEditModalComponent,
          componentProps: {
            workrel,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isWorkrel(data, store.appStore.tenantId())) {
            await (!data.bkey ?
              store.workrelService.create(data, store.appStore.currentUser()) :
              store.workrelService.update(data, store.appStore.currentUser()));
            this.reload();
          }
        }
      },

     /**
       * End an existing workrel.
       * @param workrel the work relationship to delete, its bkey needs to be valid so that we can find it in the database. 
       */
      async end(workrel?: WorkrelModel, readOnly = true): Promise<void> {
        if (workrel && !readOnly) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          const endDate = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false);
          await store.workrelService.endWorkrelByDate(workrel, endDate, store.appStore.currentUser());
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
      },

      async export(type: string): Promise<void> {
        console.log(`WorkrelStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
