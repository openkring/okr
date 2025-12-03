import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { OrgModel, PersonModel, ReservationModel, ResourceModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { confirm } from '@bk2/shared-util-angular';
import { convertDateFormatToString, DateFormat, debugListLoaded, isValidAt } from '@bk2/shared-util-core';

import { ReservationService } from '@bk2/relationship-reservation-data-access';

import { ReservationModalsService } from './reservation-modals.service';

export type ReservationsAccordionState = {
  reserver: PersonModel | OrgModel | undefined;
  reserverModelType: 'person' | 'org';
  resource: ResourceModel | undefined;
  showOnlyCurrent: boolean;
};

const initialState: ReservationsAccordionState = {
  reserver: undefined,
  reserverModelType: 'person',
  showOnlyCurrent: true,
  resource: undefined,
};

/** 
 * This store can be used for reservation accordions.
 * Either showing the reservations of a given resource (set resourceKey) or the reservations of a given user (set reserverKey).
 */
export const ReservationsAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    reservationService: inject(ReservationService),
    reservationModalsService: inject(ReservationModalsService),
    appStore: inject(AppStore),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
      // load all the reservations of the given reserver (person or org)
     reservationsResource: rxResource({
      params: () => ({
        reserver: store.reserver(),
        resource: store.resource()
      }),
      stream: ({params}) => {
        if (params.reserver) {  // return reservations of the reserver
          const reservations$ = store.reservationService.listReservationsOfReserver(params.reserver.bkey, store.reserverModelType());
          debugListLoaded('ReservationAccordionStore.reservationsOfReserver', reservations$, store.appStore.currentUser());
          return reservations$;
        } else if (params.resource) { // return reservations of the resource
          const reservations$ = store.reservationService.listReservationsForResource(params.resource.bkey);
          debugListLoaded('ReservationAccordionStore.reservationsForResource', reservations$, store.appStore.currentUser());
          return reservations$;
        } else {
          return of([]); // no reserver nor resource defined
        }
      }
    }),
  })),

  withComputed((state) => {
    return {
      allReservations: computed(() => state.reservationsResource.value() ?? []),
      currentReservations: computed(() => state.reservationsResource.value()?.filter(m => isValidAt(m.startDate, m.endDate)) ?? []),
      reservations: computed(() => state.showOnlyCurrent() ? state.reservationsResource.value() ?? [] : state.reservationsResource.value()?.filter(m => isValidAt(m.startDate, m.endDate)) ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.reservationsResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters ******************************************* */
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

      /******************************** actions ******************************************* */
      async export(): Promise<void> {
        console.log('ReservationAccordionStore.export() is not yet implemented.');
      },

      async add(reserver: PersonModel | OrgModel, reserverModelType: 'person' | 'org', defaultResource: ResourceModel | undefined, readOnly = true): Promise<void> {
        if (defaultResource !== undefined && readOnly === false) {
          await store.reservationModalsService.add(reserver, reserverModelType, defaultResource);
          store.reservationsResource.reload();
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
          await store.reservationService.endReservationByDate(reservation, convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false));    
          store.reservationsResource.reload();  
        }
      },
      

      async delete(reservation?: ReservationModel, readOnly = true): Promise<void> {
        if (reservation && readOnly === false) {
          const result = await confirm(store.alertController, '@reservation.operation.delete.confirm', true);
          if (result === true) {
            await store.reservationService.delete(reservation);
            store.reservationsResource.reload();
          } 
        }
      }
    }
  })
);
