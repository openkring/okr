import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { yearMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { ReservationModel, ResourceCollection, ResourceModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { chipMatches, convertDateFormatToString, DateFormat, debugItemLoaded, debugListLoaded, findByKey, getSystemQuery, getTodayStr, nameMatches } from '@bk2/shared-util-core';

import { ReservationService } from '@bk2/relationship-reservation-data-access';

import { ReservationModalsService } from './reservation-modals.service';

export type ReservationListState = {
  resourceId: string;
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedYear: number;
  selectedState: string;
};

const initialState: ReservationListState = {
  resourceId: '',
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedState: 'all'
};

export const ReservationListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    reservationService: inject(ReservationService),
    reservationModalsService: inject(ReservationModalsService),
  })),
  withProps((store) => ({
    reservationsResource: rxResource({
      stream: () => {
        const reservations$ = store.reservationService.list();
        debugListLoaded('ReservationListStore.reservations', reservations$, store.appStore.currentUser());
        return reservations$;
      }
    }),
    resResource: rxResource({
      params: () => ({
        resourceId: store.resourceId()
      }),
      stream: ({ params }) => {
        const allResources$ = store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
        const currentResource$ = findByKey<ResourceModel>(allResources$, params.resourceId);
        debugItemLoaded('ReservationListStore.resource', currentResource$, store.appStore.currentUser());
        return currentResource$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      allReservations: computed(() => state.reservationsResource.value() ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      selectedResource: computed(() => state.resResource.value()),
      defaultResource: computed(() => state.appStore.defaultResource()),
      isLoading: computed(() => state.reservationsResource.isLoading() || state.resResource.isLoading()),

      filteredReservations: computed(() => {
        return state.reservationsResource.value()?.filter((reservation: ReservationModel) =>
          nameMatches(reservation.index, state.searchTerm()) &&
          yearMatches(reservation.startDate, state.selectedYear() + '') &&
          nameMatches(reservation.resourceType, state.selectedType()) &&
          nameMatches(reservation.reservationState, state.selectedState()) &&
          chipMatches(reservation.tags, state.selectedTag()))
      }),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
      setResourceId(resourceId: string) {
        patchState(store, { resourceId });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedType(selectedType: string) {
        patchState(store, { selectedType });
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

      /******************************** actions ******************************************* */
      async add(): Promise<void> {
        const _person = store.currentPerson();
        const _resource = store.defaultResource();
        if (_person && _resource) {
          await store.reservationModalsService.add(_person, 'person', _resource);
          store.reservationsResource.reload();
        }
      },

      async edit(reservation?: ReservationModel): Promise<void> {
        await store.reservationModalsService.edit(reservation);
        store.reservationsResource.reload();
      },

      async end(reservation?: ReservationModel): Promise<void> {
        if (reservation) {
          const _date = await selectDate(store.modalController);
          if (!_date) return;
          const _endDate = convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false);
          await store.reservationService.endReservationByDate(reservation, _endDate, store.appStore.currentUser());
          store.reservationsResource.reload();
        }
      },

      async delete(reservation?: ReservationModel): Promise<void> {
        if (reservation) {
          await store.reservationService.delete(reservation, store.appStore.currentUser());
          store.reservationsResource.reload();
        }
      },

      async export(type: string): Promise<void> {
        console.log(`ReservationListStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
