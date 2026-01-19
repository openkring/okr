import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { ReservationCollection, ReservationModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getReservationIndex } from '@bk2/relationship-reservation-util';

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);

  /*-------------------------- CRUD operations on reservation --------------------------------*/
  /**
   * Create a new reservation and save it to the database.
   * @param reservation the new reservation to save
   * @param currentUser the user who is creating the reservation
   * @returns the document id of the stored reservation in the database
   */
  public async create(reservation: ReservationModel, currentUser?: UserModel): Promise<string | undefined> {
    reservation.index = getReservationIndex(reservation);
    return await this.firestoreService.createModel<ReservationModel>(ReservationCollection, reservation, '@reservation.operation.create', currentUser);
  }

  /**
   * Retrieve an existing reservation from the cached list of all reservations.
   * @param key the key of the reservation to retrieve
   * @returns the reservation as an Observable
   */
  public read(key: string): Observable<ReservationModel | undefined> {
    return findByKey<ReservationModel>(this.list(), key);
  }

  /**
   * Update an existing reservation with new values.
   * @param reservation the reservation to update
   * @param currentUser the user who is updating the reservation
   * @param confirmMessage the i18n key for the confirmation message to show in a toast
   * @returns the document id of the updated reservation or undefined if the operation failed
   */
  public async update(reservation: ReservationModel, currentUser?: UserModel, confirmMessage = '@reservation.operation.update'): Promise<string | undefined> {
    reservation.index = getReservationIndex(reservation);
    return await this.firestoreService.updateModel<ReservationModel>(ReservationCollection, reservation, false, confirmMessage, currentUser);
  }

  /**
   * Delete an existing reservation.
   * @param reservation the reservation to delete, its bkey needs to be valid so that we can find it in the database.
   * @param currentUser the user who is deleting the reservation
   * @returns a Promise that resolves when the deletion is complete 
   */
  public async delete(reservation: ReservationModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ReservationModel>(ReservationCollection, reservation, '@reservation.operation.delete', currentUser);
  }

  /**
   * End an existing reservation by setting its validTo date.
   * @param reservation the reservation to end
   * @param endDate the date to set as the end date of the reservation, it should be in the format YYYYMMDD
   * @param currentUser the user who is ending the reservation
   * @returns a Promise that resolves to the document id of the updated reservation or undefined if the operation failed
   */
  public async endReservationByDate(reservation: ReservationModel, endDate: string, currentUser?: UserModel): Promise<string | undefined> {
    if (reservation.endDate.startsWith('9999') && endDate && endDate.length === 8) {
      reservation.endDate = endDate;
      return await this.firestoreService.updateModel<ReservationModel>(ReservationCollection, reservation, false, '@reservation.operation.end', currentUser);
    }
    return undefined;
  }

  /*-------------------------- list --------------------------------*/
  public list(orderBy = 'startDate', sortOrder = 'asc'): Observable<ReservationModel[]> {
    return this.firestoreService.searchData<ReservationModel>(ReservationCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /**
   * List the reservations that a subject has.
   * @param reserverKey the document id of the person or org making the reservation
   * @param modelType the type of the reserver (Person or Org)
   * @returns an Observable array of the selected reservations
   */
  public listReservationsOfReserver(reserverKey: string, modelType: 'person' | 'org'): Observable<ReservationModel[]> {
    if (!reserverKey || reserverKey.length === 0) return of([]);
    if (!modelType || (modelType !== 'person' && modelType !== 'org')) return of([]);
    return this.list().pipe(
      map((reservations: ReservationModel[]) => {
        return reservations.filter((reservation: ReservationModel) => {
          return (reservation.reserver?.key === reserverKey && reservation.reserver.modelType === modelType);
        });
      })
    );
  }

  /**
   * List the reservations for a given resource.
   * @param resourceKey the id of the resource to list its reservations for
   * @returns a list of the reservations of the resource as an Observable
   */
  public listReservationsForResource(resourceKey: string): Observable<ReservationModel[]> {
    if (!resourceKey || resourceKey.length === 0) return of([]);
    return this.list().pipe(
      map((reservations: ReservationModel[]) => {
        return reservations.filter((reservation: ReservationModel) => {
          return (reservation.resource?.key === resourceKey);
        });
      })
    );
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('ReservationService.export: not yet implemented.');
  }

  /*  private async selectExportType(): Promise<number | undefined> {
     const modal = await this.modalController.create({
       component: BkLabelSelectModalComponent,
       componentProps: {
         labels: [
           '@reservation.select.raw', 
           '@reservation.select.lockers', 
         ],
         icons: ['list-circle', 'list'],
         title: '@reservation.select.title'
       }
     });
     modal.present();
     const { data, role } = await modal.onDidDismiss();
     if (role === 'confirm') {
       if (data !== undefined) {
         console.log('ReservationService.selectExportType: data: ' + data);
         return parseInt(data);
       }
     }
     return undefined;
   } */
}
