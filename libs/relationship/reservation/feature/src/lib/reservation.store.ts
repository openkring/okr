import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { yearMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { confirm } from '@bk2/shared-util-angular';
import { CategoryListModel, OrgModel, PersonModel, ReservationModel, ResourceCollection, ResourceModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { chipMatches, convertDateFormatToString, DateFormat, debugItemLoaded, debugListLoaded, findByKey, getSystemQuery, getTodayStr, isValidAt, nameMatches } from '@bk2/shared-util-core';
import { DEFAULT_NAME } from '@bk2/shared-constants';

import { ReservationService } from '@bk2/relationship-reservation-data-access';
import { isReservation } from '@bk2/relationship-reservation-util';

import { ReservationEditModalComponent } from './reservation-edit.modal';

export type ReservationState = {
  resourceId: string;   // id of the current resource
  showOnlyCurrent: boolean;
  reserver: PersonModel | OrgModel | undefined;
  reserverModelType: 'person' | 'org';
  resource: ResourceModel | undefined;
  
  // filters
  searchTerm: string;
  selectedTag: string;
  selectedReason: string;
  selectedYear: number;
  selectedState: string;
};

const initialState: ReservationState = {
  resourceId: '',
  showOnlyCurrent: true,
  reserver: undefined,
  reserverModelType: 'person',
  resource: undefined,

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedReason: 'all',
  selectedYear: 99, // all years
  selectedState: 'all'
};

export const ReservationStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    reservationService: inject(ReservationService),
    alertController: inject(AlertController),
    modalController: inject(ModalController)
  })),
  withProps((store) => ({
    reservationsResource: rxResource({
      params: () => ({
        reserver: store.reserver(),
        resource: store.resource()
      }),
      stream: ({params}) => {
        if (params.reserver) {  // return reservations of the reserver
          return store.reservationService.listReservationsOfReserver(params.reserver.bkey, store.reserverModelType()).pipe(
            debugListLoaded('ReservationAccordionStore.reservationsOfReserver', store.appStore.currentUser())
          );
        } else if (params.resource) { // return reservations of the resource
          return store.reservationService.listReservationsForResource(params.resource.bkey).pipe(
            debugListLoaded('ReservationAccordionStore.reservationsForResource', store.appStore.currentUser())
          );
        } else {    // return all reservations
          return store.reservationService.list().pipe(
            debugListLoaded('ReservationAccordionStore.allReservations', store.appStore.currentUser())
          );
        }
      }
    }),
    resResource: rxResource({
      params: () => ({
        resourceId: store.resourceId(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        const allResources$ = store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
        return findByKey<ResourceModel>(allResources$, params.resourceId).pipe(
          debugItemLoaded('ReservationStore.resource', params.currentUser)
        );
      }
    }),
  })),

  withComputed((state) => {
    return {
      allReservations: computed(() => state.reservationsResource.value() ?? []),
      currentReservations: computed(() => state.reservationsResource.value()?.filter(m => isValidAt(m.startDate, m.endDate)) ?? []),
      reservations: computed(() => state.showOnlyCurrent() ? state.reservationsResource.value() ?? [] : state.reservationsResource.value()?.filter(m => isValidAt(m.startDate, m.endDate)) ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      selectedResource: computed(() => state.resResource.value()),
      defaultResource: computed(() => state.appStore.defaultResource()),
      isLoading: computed(() => state.reservationsResource.isLoading() || state.resResource.isLoading()),
      tenantId: computed(() => state.appStore.tenantId()),
      imgixBaseUrl: computed(() => state.appStore.env.services.imgixBaseUrl),

      filteredReservations: computed(() => {
        console.log('ReservationStore.filteredReservations by ', {
          searchTerm: state.searchTerm(),
          selectedYear: state.selectedYear(),
          selectedReason: state.selectedReason(),
          selectedState: state.selectedState(),
          selectedTag: state.selectedTag()
        });
        return state.reservationsResource.value()?.filter((reservation: ReservationModel) =>
          nameMatches(reservation.index, state.searchTerm()) &&
          yearMatches(reservation.startDate, state.selectedYear()) &&
          nameMatches(reservation.reservationReason, state.selectedReason()) &&
          nameMatches(reservation.reservationState, state.selectedState()) &&
          chipMatches(reservation.tags, state.selectedTag()))
      }),
    }
  }),

  withMethods((store) => {
    return {
      reload() {
        store.reservationsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setResourceId(resourceId: string) {
        patchState(store, { resourceId });
      },

      setReserver(reserver: PersonModel | OrgModel, reserverModelType: 'person' | 'org') {
        patchState(store, { reserver, reserverModelType });
        store.reservationsResource.reload();
      },

      setResource(resource: ResourceModel | undefined) {
        patchState(store, { resource });
        store.reservationsResource.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      // filters
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedReason(selectedReason: string) {
        patchState(store, { selectedReason });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('reservation');
      },

      getReasons(): CategoryListModel {
        return store.appStore.getCategory('reservation_reason');
      },

      getStates(): CategoryListModel {
        return store.appStore.getCategory('reservation_state');
      },

      getPeriodicities(): CategoryListModel {
        return store.appStore.getCategory('periodicity');
      },

      getResourceTypes(): CategoryListModel {
        return store.appStore.getCategory('resource_type');
      },

      getRboatTypes(): CategoryListModel {
        return store.appStore.getCategory('rboat_type');
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const newReservation = new ReservationModel(store.appStore.tenantId());
        // use either reserver (person/org) or resource from the store to prefill the new reservation or use currentPerson and defaultResource
        const reserver = store.reserver() ?? store.currentPerson();
        const resource = store.resource() ?? store.defaultResource();
        if (reserver && resource) {
          newReservation.reserverKey = reserver.bkey;
          if (store.reserverModelType() === 'person') {
            const res = reserver as PersonModel;
            newReservation.reserverModelType = 'person';
            newReservation.reserverName = res.firstName;
            newReservation.reserverName2 = res.lastName;
            newReservation.reserverType = res.gender;

          } else {
            const res = reserver as OrgModel;
            newReservation.reserverModelType = 'org';
            newReservation.reserverName = DEFAULT_NAME;
            newReservation.reserverName2 = res.name;
            newReservation.reserverType = res.type;
          }
          newReservation.resourceKey = resource.bkey;
          newReservation.resourceName = resource.name;
          newReservation.resourceModelType = 'resource';
          newReservation.resourceType = resource.type;
          newReservation.resourceSubType = resource.subType;
          newReservation.startDate = getTodayStr(DateFormat.StoreDate);
          await this.edit(newReservation, readOnly, true);
        }
      },

      async edit(reservation: ReservationModel, readOnly = true, isSelectable = false): Promise<void> {
        const modal = await store.modalController.create({
          component: ReservationEditModalComponent,
          componentProps: {
            reservation,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            reasons: this.getReasons(),
            states: this.getStates(),
            periodicities: this.getPeriodicities(),
            isSelectable,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isReservation(data, store.tenantId())) {
            await (!data.bkey ? 
              store.reservationService.create(data, store.currentUser()) : 
              store.reservationService.update(data, store.currentUser()));
            this.reload();
          }
        }
      },

      async end(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (reservation && !readOnly) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          const endDate = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false);
          await store.reservationService.endReservationByDate(reservation, endDate, store.appStore.currentUser());
          this.reload();
        }
      },

      async delete(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (reservation && !readOnly) {
          const result = await confirm(store.alertController, '@reservation.operation.delete.confirm', true);
          if (result === true) {
            await store.reservationService.delete(reservation, store.appStore.currentUser());
            this.reload();
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`ReservationStore.export(${type}) is not yet implemented.`);
      },
    }
  }),
);
