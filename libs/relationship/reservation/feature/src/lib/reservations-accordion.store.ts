import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { ModelType, OrgModel, PersonModel, ReservationModel, ResourceModel } from '@bk2/shared/models';
import { convertDateFormatToString, DateFormat, debugListLoaded, isValidAt } from '@bk2/shared/util';
import { confirm } from '@bk2/shared/i18n';

import { AppStore } from '@bk2/auth/feature';
import { ReservationService } from '@bk2/reservation/data-access';
import { ReservationModalsService } from './reservation-modals.service';
import { selectDate } from '@bk2/shared/ui';

export type ReservationsAccordionState = {
  reserver: PersonModel | OrgModel | undefined;
  reserverModelType: ModelType;
  showOnlyCurrent: boolean;
};

const initialState: ReservationsAccordionState = {
  reserver: undefined,
  reserverModelType: ModelType.Person,
  showOnlyCurrent: true,
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
      request: () => ({
        reserver: store.reserver()
      }),
      loader: ({request}) => {
        if (!request.reserver) return of([]);
        const reservations$ = store.reservationService.listReservationsOfReserver(request.reserver.bkey, store.reserverModelType());
        debugListLoaded('ReservationAccordionStore.reservations', reservations$, store.appStore.currentUser());
        return reservations$;
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
      setReserver(reserver: PersonModel | OrgModel, reserverModelType: ModelType) {
        patchState(store, { reserver, reserverModelType });
        store.reservationsResource.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** actions ******************************************* */
      async export(): Promise<void> {
        console.log('ReservationAccordionStore.export() is not yet implemented.');
      },

      async add(reserver: PersonModel | OrgModel, reserverModelType: ModelType, defaultResource: ResourceModel | undefined): Promise<void> {
        if (defaultResource !== undefined) {
          await store.reservationModalsService.add(reserver, reserverModelType, defaultResource);
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
          await store.reservationService.endReservationByDate(reservation, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false));    
          store.reservationsResource.reload();  
        }
      },
      

      async delete(reservation?: ReservationModel): Promise<void> {
        if (reservation) {
          const _result = await confirm(store.alertController, '@reservation.operation.delete.confirm', true);
          if (_result === true) {
            await store.reservationService.delete(reservation);
            store.reservationsResource.reload();
          } 
        }
      }
    }
  })
);
