import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { AlertController, ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore, OrgSelectModal, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { CategoryListModel, OrgModel, PersonModel, WorkrelModel } from '@okr/shared-models';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, die, getTodayStr, isOrg, isPerson, isValidAt, nameMatches } from '@okr/shared-util-core';
import { confirm } from '@okr/shared-util-angular';
import { selectDate } from '@okr/shared-ui';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';

import { WorkrelService } from '@okr/relationship-workrel-data-access';
import { isWorkrel, WORKREL_I18N_KEYS } from '@okr/relationship-workrel-util';

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
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(WORKREL_I18N_KEYS),

    workrelsResource: rxResource({
      params: () => ({
        personKey: store.personKey(),
        orgKey: store.orgKey(),
      }),
      stream: ({params}) => {
        if (!params.personKey && params.orgKey) return of([]);  // an org parent reads workersResource
        return params.personKey ?
          store.workrelService.listWorkrelsOfPerson(params.personKey) : 
          store.workrelService.list().pipe(
            debugListLoaded('WorkrelStore.workrels of person', store.appStore.currentUser())
          );
      }
    }),
    workersResource: rxResource({
      params: () => ({
        orgKey: store.orgKey(),
      }),
      stream: ({ params }) => {
        return store.workrelService.listWorkersOfOrg(params.orgKey).pipe(
          debugListLoaded('WorkrelStore.workers of org', store.appStore.currentUser())
        );
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
      /** the rows of an accordion: the workers of the parent org, else the work relationships of the parent person */
      parentWorkrels: computed(() => (state.orgKey() ? state.workersResource.value() : state.workrelsResource.value()) ?? []),
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
        store.workersResource.reload();
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
        store.workersResource.reload();
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
       * The parent of an accordion (personKey or orgKey) is prefilled; the other side falls back to the
       * current person resp. the tenant's default org.
       */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const personKey = store.personKey();
        const orgKey = store.orgKey();
        const person = (personKey ? store.appStore.getPerson(personKey) : undefined) ?? store.currentPerson();
        const org = (orgKey ? store.appStore.getOrg(orgKey) : undefined) ?? store.currentOrg();
        const newWorkrel = new WorkrelModel(store.appStore.tenantId());
        newWorkrel.subjectKey = person.okey;
        newWorkrel.subjectName1 = person.firstName;
        newWorkrel.subjectName2 = person.lastName;
        newWorkrel.subjectModelType = 'person';
        newWorkrel.subjectType = person.gender;

        newWorkrel.objectKey = org.okey;
        newWorkrel.objectName = org.name;
        newWorkrel.objectType = org.type;

        newWorkrel.validFrom = getTodayStr();
        newWorkrel.validTo = END_FUTURE_DATE_STR;
        await this.edit(newWorkrel, readOnly);
      },

      /**
       * Show a modal to edit an existing work relationship.
       * @param workrel the work relationship to edit
       */
      async edit(workrel: WorkrelModel, readOnly = true): Promise<void> {
        const { WorkrelEditModal } = await import('./workrel-edit.modal');
        const modal = await store.modalController.create({
          component: WorkrelEditModal,
          componentProps: {
            workrel,
            currentUser: store.currentUser(),
            tagModel: 'workrel',
            types: this.getTypes(),
            states: this.getStates(),
            tenantId: store.tenantId(),
            periodicities: this.getPeriodicities(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isWorkrel(data, store.appStore.tenantId())) {
            await (!data.okey ?
              store.workrelService.create(data, store.appStore.currentUser()) :
              store.workrelService.update(data, store.appStore.currentUser()));
            this.reload();
          }
        }
      },

     /**
       * End an existing workrel.
       * @param workrel the work relationship to delete, its okey needs to be valid so that we can find it in the database. 
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
          const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
          if (result === true) {
            await store.workrelService.delete(workrel, store.appStore.currentUser());
            store.workrelsResource.reload();
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`WorkrelStore.export(${type}) is not yet implemented.`);
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.update();
        } else {
          return store.i18n.create();
        }
      },

      async selectPerson(): Promise<PersonModel | undefined> {
        const modal = await store.modalController.create({
          component: PersonSelectModal,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser(),
            tenantId: store.tenantId()
          }
        });
        modal.present();
        const { data: result, role } = await modal.onWillDismiss<PersonSelectResult>();
        const data = result?.kind === 'predefined' ? result.person : undefined;
        if (role === 'confirm' && data) {
          if (isPerson(data, store.tenantId())) {
            return data;
          }
        }
        return undefined;
      },

      async selectOrg(): Promise<OrgModel | undefined> {
        const modal = await store.modalController.create({
          component: OrgSelectModal,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser()
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm') {
          if (isOrg(data, store.tenantId())) {
            return data;
          }
        }
        return undefined;
      }
    }
  }),
);
