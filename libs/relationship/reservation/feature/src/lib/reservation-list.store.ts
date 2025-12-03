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
  selectedReason: string;
  selectedYear: number;
  selectedState: string;
};

const initialState: ReservationListState = {
  resourceId: '',
  searchTerm: '',
  selectedTag: '',
  selectedReason: 'all',
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
          nameMatches(reservation.reservationReason, state.selectedReason()) &&
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

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly === false) {
          const person = store.currentPerson();
          const resource = store.defaultResource();
          if (person && resource) {
            await store.reservationModalsService.add(person, 'person', resource);
            store.reservationsResource.reload();
          }
        }
      },

      async edit(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (readOnly === false) {
          await store.reservationModalsService.edit(reservation);
          store.reservationsResource.reload();
        }
      },

      async end(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (reservation && readOnly === false) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          const endDate = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false);
          await store.reservationService.endReservationByDate(reservation, endDate, store.appStore.currentUser());
          store.reservationsResource.reload();
        }
      },

      async delete(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (reservation && readOnly === false) {
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
