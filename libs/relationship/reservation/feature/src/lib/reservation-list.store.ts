import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { chipMatches, DateFormat, debugItemLoaded, debugListLoaded, findByKey, getSystemQuery, getTodayStr, nameMatches, searchData } from '@bk2/shared/util';
import { AllCategories, ModelType, ReservationModel, ResourceCollection, ResourceModel } from '@bk2/shared/models';
import { categoryMatches, yearMatches } from '@bk2/shared/categories';

import { AppStore } from '@bk2/auth/feature';

import { ReservationService } from '@bk2/reservation/data-access';
import { ReservationModalsService } from './reservation-modals.service';

export type ReservationListState = {
  resourceId: string;
  searchTerm: string;
  selectedTag: string;
  selectedType: number;
  selectedYear: number;
  selectedState: number;
};

const initialState: ReservationListState = {
  resourceId: '',
  searchTerm: '',
  selectedTag: '',
  selectedType: AllCategories,
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedState: AllCategories
};

export const ReservationListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    env: inject(ENV),
    firestore: inject(FIRESTORE),
    modalController: inject(ModalController),
    reservationService: inject(ReservationService),
    reservationModalsService: inject(ReservationModalsService),
  })),
  withProps((store) => ({
    reservationsResource: rxResource({
      loader: () => {
        const reservations$ = store.reservationService.list();
        debugListLoaded('ReservationListStore.reservations', reservations$, store.appStore.currentUser());
        return reservations$;
      }
    }),
    resResource: rxResource({
      request: () => ({
        resourceId: store.resourceId()
      }),  
      loader: ({request}) => {
        const allResources$ = searchData<ResourceModel>(store.firestore, ResourceCollection, getSystemQuery(store.env.owner.tenantId), 'name', 'asc');
        const currentResource$ = findByKey<ResourceModel>(allResources$, request.resourceId); 
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
      defaultResource : computed(() => state.appStore.defaultResource()),
      isLoading: computed(() => state.reservationsResource.isLoading() || state.resResource.isLoading()),

      filteredReservations: computed(() => {
        return state.reservationsResource.value()?.filter((reservation: ReservationModel) => 
          nameMatches(reservation.index, state.searchTerm()) &&
          yearMatches(reservation.startDate, state.selectedYear() + '') &&
          categoryMatches(reservation.resourceType, state.selectedType()) &&
          categoryMatches(reservation.reservationState, state.selectedState()) &&
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

      setSelectedType(selectedType: number) {
        patchState(store, { selectedType });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedState(selectedState: number) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Reservation);
      },

      /******************************** actions ******************************************* */
      async add(): Promise<void> {
        const _person = store.currentPerson();
        const _resource = store.defaultResource();
        if (_person && _resource) {
          await store.reservationModalsService.add(_person, ModelType.Person, _resource);
          store.reservationsResource.reload();
        }
      },

      async edit(reservation?: ReservationModel): Promise<void> {
        await store.reservationModalsService.edit(reservation);
        store.reservationsResource.reload();
      },

      async end(reservation?: ReservationModel): Promise<void> {
        if (reservation) {
          await store.reservationService.end(reservation);
          store.reservationsResource.reload();  
        }
      },

      async delete(reservation?: ReservationModel): Promise<void> {
        if (reservation) {
          await store.reservationService.delete(reservation);
          store.reservationsResource.reload();  
        }
      },

      async export(type: string): Promise<void> {
        console.log(`ReservationListStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
