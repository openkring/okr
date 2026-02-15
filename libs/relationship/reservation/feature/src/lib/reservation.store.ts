import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { yearMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { confirm } from '@bk2/shared-util-angular';
import { CalEventCollection, CalEventModel, CategoryListModel, OrgModel, PersonModel, ReservationModel, ResourceCollection, ResourceModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { chipMatches, convertDateFormatToString, DateFormat, debugItemLoaded, debugListLoaded, findByKey, getAvatarInfo, getSystemQuery, getTodayStr, getYear, isValidAt, nameMatches } from '@bk2/shared-util-core';

import { ReservationService } from '@bk2/relationship-reservation-data-access';
import { isReservation } from '@bk2/relationship-reservation-util';

import { ReservationEditModalComponent } from './reservation-edit.modal';
import { of, take } from 'rxjs';

export type ReservationState = {
  listId: string;       // filter format: t_resourceType, r_resourceKey, p_reserverKey, or 'all'
  showOnlyCurrent: boolean;
  reserverId: string | undefined; // current reserver -> if reservations are filtered by this reserver
  reserverModelType: 'person' | 'org'; // model type of the reserver (if reservations are reserver-restricted)
  resourceId: string | undefined;   // id of the current resource -> used when reservations are resource-restricted
  caleventId: string | undefined;
  
  // filters
  searchTerm: string;
  selectedTag: string;
  selectedReason: string;
  selectedYear: number;
  selectedState: string;
};

const initialState: ReservationState = {
  listId: 'all',
  showOnlyCurrent: true,
  reserverId: undefined,
  reserverModelType: 'person',
  resourceId: undefined,
  caleventId: undefined,

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedReason: 'all',
  selectedYear: getYear(), // initialize to current year to match ListFilterComponent default
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
    allReservationsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.reservationService.list().pipe(
          debugListLoaded('ReservationStore.allReservations', params.currentUser)
        );
      }
    }),
    currentResourceResource: rxResource({
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
    currentReserverResource: rxResource({
      params: () => ({
        reserverId: store.reserverId(),
        reserverModelType: store.reserverModelType(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        if (!params.reserverId || !params.reserverId.length) return of(undefined);
        const collection = params.reserverModelType === 'person' ? 'persons' : 'orgs';
        return store.firestoreService.readModel<PersonModel | OrgModel>(collection, params.reserverId).pipe(
          take(1),
          debugItemLoaded('ReservationStore.reserver', params.currentUser)
        );
      }
    }),
    caleventResource: rxResource({
      params: () => ({
        caleventId: store.caleventId(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        if (!params.caleventId || !params.caleventId.length) return of(undefined);
        return store.firestoreService.readModel<CalEventModel>(CalEventCollection, params.caleventId).pipe(
          take(1),
          debugItemLoaded('ReservationStore.caleventResource', params.currentUser)
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      allReservations: computed(() => state.allReservationsResource.value() ?? []),
      currentReservations: computed(() => state.allReservationsResource.value()?.filter(m => isValidAt(m.startDate, m.endDate)) ?? []),
      reservations: computed(() => state.showOnlyCurrent() ? state.allReservationsResource.value() ?? [] : state.allReservationsResource.value()?.filter(m => isValidAt(m.startDate, m.endDate)) ?? []),
      currentReserver: computed(() => state.currentReserverResource.value()),
      currentResource: computed(() => state.currentResourceResource.value()),
      calevent: computed(() => state.caleventResource.value() ?? undefined),

      // defaults if we do not have reserver or resource set explicitly
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource: computed(() => state.appStore.defaultResource()),

      isLoading: computed(() => state.allReservationsResource.isLoading() || state.currentResourceResource.isLoading() || state.caleventResource.isLoading()),
      tenantId: computed(() => state.appStore.tenantId()),
      imgixBaseUrl: computed(() => state.appStore.env.services.imgixBaseUrl),
    }
  }),

    withComputed((state) => {
      return {
        filteredReservations: computed(() => {
          const allReservations = state.reservations() ?? [];
          
          // Apply listId filter first
          let filtered = allReservations;
          const listId = state.listId();
          
          if (listId && listId !== 'all') {
            const prefix = listId.substring(0,2);
            const value = listId.substring(2);
            
            switch (prefix) {
            case 't_': // resource type
              filtered = filtered.filter(r => r.resource?.type === value);
              break;
            case 'r_': // resource key
              filtered = filtered.filter(r => r.resource?.key === value);
              filtered = filtered.filter(r => r.resource?.key === value);
              break;
            case 'p_': // reserver key (person)
              filtered = filtered.filter(r => r.reserver?.key === value);
              break;
            case 'o_': // reserver key (org)
              filtered = filtered.filter(r => r.reserver?.key === value);
              break;
            default:
              console.warn(`ReservationStore: unknown listId prefix '${prefix}' in listId '${listId}'`);
              return allReservations;
            }
          }
          
          // Apply other filters
          return filtered.filter((reservation: ReservationModel) =>
            nameMatches(reservation.index, state.searchTerm()) &&
            yearMatches(reservation.startDate, state.selectedYear()) &&
            nameMatches(reservation.reason, state.selectedReason()) &&
            nameMatches(reservation.state, state.selectedState()) &&
            chipMatches(reservation.tags, state.selectedTag()))
        }),
      }
    }),

  withMethods((store) => {
    return {
      reload() {
        store.allReservationsResource.reload();
        store.currentReserverResource.reload();
        store.currentResourceResource.reload();
        store.caleventResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setListId(listId: string) {
        if (listId === 'my') {
          const currentUser = store.appStore.currentUser();
          if (currentUser && currentUser.personKey) {
            const id = 'p_' + currentUser.personKey;
            patchState(store, { listId: id });
          }
        } else {
          patchState(store, { listId });
        }

        if (listId && listId !== 'all') {
          let prefix = listId.substring(0,2);
          let value = listId.substring(2);
          
          switch (prefix) {
            case 'r_': // resource key */
              patchState(store, { resourceId: value, reserverId: undefined });
              break;
            case 'p_': // reserver key (person) */
              patchState(store, { reserverId: value, reserverModelType: 'person', resourceId: undefined });
              break;
            case 'o_': // reserver key (org) */
              patchState(store, { reserverId: value, reserverModelType: 'org', resourceId: undefined });
              break;
          }
          this.reload();
        }
      },

      setReserverId(reserverId: string | undefined, reserverModelType: 'person' | 'org') {
        patchState(store, { reserverId, reserverModelType, resourceId: undefined });
        this.reload();
      },

      setResourceId(resourceId: string | undefined) {
        patchState(store, { resourceId, reserverId: undefined });
        this.reload();
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

      getResource(resourceKey: string): ResourceModel | undefined {
        return store.appStore.getResource(resourceKey);
      },

      getLocale(): string {
        return store.appStore.appConfig().locale;
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const newReservation = new ReservationModel(store.appStore.tenantId());
        // use either reserver (person/org) or resource from the store to prefill the new reservation or use currentPerson and defaultResource
        const reserver = store.currentReserver() ?? store.currentPerson();
        const reserverModelType = store.currentReserver() ? store.reserverModelType() : 'person';
        const resource = store.currentResource() ?? store.defaultResource();
        if (reserver && resource) {
          newReservation.reserver = getAvatarInfo(reserver, reserverModelType);
          newReservation.resource = getAvatarInfo(resource, 'resource');
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
            locale: this.getLocale(),
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
