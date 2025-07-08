import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { ModelType, ReservationCollection, ReservationModel, UserModel } from '@bk2/shared/models';
import { saveComment } from '@bk2/comment/util';
import { createModel, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/util-core';
import { confirmAction } from '@bk2/shared/util-angular';

import { getReservationSearchIndex, getReservationSearchIndexInfo } from '@bk2/relationship/reservation/util';
import { bkTranslate } from '@bk2/shared/i18n';

@Injectable({
    providedIn: 'root'
})
export class ReservationService {
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly env = inject(ENV);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations on reservation --------------------------------*/
  /**
   * Create a new reservation and save it to the database.
   * @param reservation the new reservation to save
   * @returns the document id of the stored reservation in the database
   */
  public async create(reservation: ReservationModel, currentUser?: UserModel): Promise<string> {
    try {
      reservation.index = this.getSearchIndex(reservation);
      const _key = await createModel(this.firestore, ReservationCollection, reservation, this.tenantId);
      await confirmAction(bkTranslate('@reservation.operation.create.conf'), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, ReservationCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate('@reservation.operation.create.error'), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
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
   * @param i18nPrefix the prefix for the i18n key to use for the toast message (can be used for a delete confirmation)
   */
  public async update(reservation: ReservationModel, currentUser?: UserModel, confirmMessage = '@reservation.operation.update'): Promise<string> {
    try {
      reservation.index = this.getSearchIndex(reservation);
      const _key = await updateModel(this.firestore, ReservationCollection, reservation);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, ReservationCollection, _key, '@comment.operation.update.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Delete an existing reservation.
   * @param reservation the reservation to delete, its bkey needs to be valid so that we can find it in the database. 
   */
  public async delete(reservation: ReservationModel, currentUser?: UserModel): Promise<void> {
    reservation.isArchived = true;
    await this.update(reservation, currentUser, `@reservation.operation.delete`);
  }

  /**
   * End an existing reservation by setting its validTo date.
   * @param reservation the reservation to end
   * @param dateOfExit the end date of the reservation
   */
  public async endReservationByDate(reservation: ReservationModel, endDate: string, currentUser?: UserModel): Promise<void> {
    if (reservation.endDate.startsWith('9999') && endDate && endDate.length === 8) {
      reservation.endDate = endDate;
      await this.update(reservation, currentUser);
      await saveComment(this.firestore, this.tenantId, currentUser, ReservationCollection, reservation.bkey, '@comment.message.reservation.deleted');  
    }
  }

  /*-------------------------- list --------------------------------*/
  public list(orderBy = 'reserverName2', sortOrder = 'asc'): Observable<ReservationModel[]> {
    return searchData<ReservationModel>(this.firestore, ReservationCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /**
   * List the reservations that a subject has.
   * @param reserverKey the document id of the person or org making the reservation
   * @param modelType the type of the reserver (Person or Org)
   * @returns an Observable array of the selected reservations
   */
  public listReservationsOfReserver(reserverKey: string, modelType: ModelType): Observable<ReservationModel[]> {
    if (!reserverKey || reserverKey.length === 0) return of([]);
    if (!modelType || (modelType !== ModelType.Person && modelType !== ModelType.Org)) return of([]);
    return this.list().pipe(
      map((reservations: ReservationModel[]) => {
        return reservations.filter((reservation: ReservationModel) => {
          return (reservation.reserverKey === reserverKey && reservation.reserverModelType === modelType);
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
          return (reservation.resourceKey === resourceKey);
        });
      })
    );
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('ReservationService.export: not yet implemented.');
  }

 /*  private async selectExportType(): Promise<number | undefined> {
    const _modal = await this.modalController.create({
      component: BkLabelSelectModalComponent,
      componentProps: {
        labels: [
          '@reservation.select.raw', 
          '@reservation.select.lockers', 
        ],
        icons: ['list-circle-outline', 'list-outline'],
        title: '@reservation.select.title'
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (data !== undefined) {
        console.log('ReservationService.selectExportType: data: ' + data);
        return parseInt(data);
      }
    }
    return undefined;
  } */
 
  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(reservation: ReservationModel): string {
    return getReservationSearchIndex(reservation);
  }

  public getSearchIndexInfo(): string {
    return getReservationSearchIndexInfo();
  }
}
