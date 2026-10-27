import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo, ReservationCollection, ReservationModel, UserModel } from '@okr/shared-models';
import { fill, getAvatarInfoForCurrentUser, getFullName, getSystemQuery, getTodayStr } from '@okr/shared-util-core';

import { getReservationIndex, newLockReservation } from '@okr/relationship-reservation-util';
import { ActivityService } from '@okr/activity-data-access';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
    end_conf:     PFX + 'end.conf',
    end_error:    PFX + 'end.error',
    lock_name:    PFX + 'lock.name',            // {name}
    lock_defaultReason: PFX + 'lock.defaultReason',
  });

  /*-------------------------- CRUD operations on reservation --------------------------------*/
  /**
   * Create a new reservation and save it to the database.
   * @param reservation the new reservation to save
   * @param currentUser the user who is creating the reservation
   * @param silent true: no confirmation toast (a record written as a side effect, e.g. of a damage report)
   * @returns the document id of the stored reservation in the database
   */
  public async create(reservation: ReservationModel, currentUser?: UserModel, silent = false): Promise<string | undefined> {
    reservation.index = getReservationIndex(reservation);
    const key = await this.firestoreService.createModel<ReservationModel>(ReservationCollection, reservation, silent ? undefined : this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${getFullName(reservation.reserver?.name1, reservation.reserver?.name2)} of ${reservation.resource?.key}/${reservation.resource?.name2} on ${reservation.startDate}`;
    void this.activityService.log('reservation', 'create', currentUser, payload);
    return key;
  }

  /**
   * Retrieve an existing reservation from the cached list of all reservations.
   * @param key the key of the reservation to retrieve
   * @returns the reservation as an Observable
   */
  public read(key: string): Observable<ReservationModel | undefined> {
    return this.firestoreService.readTenantModel<ReservationModel>(ReservationCollection, key, this.env.tenantId);
  }

  /**
   * Update an existing reservation with new values.
   * @param reservation the reservation to update
   * @param currentUser the user who is updating the reservation
   * @returns the document id of the updated reservation or undefined if the operation failed
   */
  public async update(reservation: ReservationModel, currentUser?: UserModel): Promise<string | undefined> {
    reservation.index = getReservationIndex(reservation);
    const key = await this.firestoreService.updateModel<ReservationModel>(ReservationCollection, reservation, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${key}: ${getFullName(reservation.reserver?.name1, reservation.reserver?.name2)} of ${reservation.resource?.key}/${reservation.resource?.name2} on ${reservation.startDate}`;
    void this.activityService.log('reservation', 'update', currentUser, payload);
    return key;
  }

  /**
   * Delete an existing reservation.
   * @param reservation the reservation to delete, its okey needs to be valid so that we can find it in the database.
   * @param currentUser the user who is deleting the reservation
   * @returns a Promise that resolves when the deletion is complete 
   */
  public async delete(reservation: ReservationModel, currentUser?: UserModel): Promise<void> {
    const payload = `${reservation.okey}: ${getFullName(reservation.reserver?.name1, reservation.reserver?.name2)} of ${reservation.resource?.key}/${reservation.resource?.name2} on ${reservation.startDate}`;
    await this.firestoreService.deleteModel<ReservationModel>(ReservationCollection, reservation, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('reservation', 'delete', currentUser, payload);
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
      return await this.firestoreService.updateModel<ReservationModel>(ReservationCollection, reservation, false, this.i18n.end_conf(), this.i18n.end_error(), currentUser);
    }
    return undefined;
  }

  /*-------------------------- lock --------------------------------*/
  /**
   * Lock a resource (e.g. a rowing boat) until further notice: an open-ended 'blocked' reservation,
   * which the Logbuch treats like a damage-report lock (findActiveReservationForResource).
   * @param resource the resource to lock, as AvatarInfo (getAvatarInfo(resource, 'resource'))
   * @param reason why it is locked; a blank reason is replaced by a generic text, because the
   * description is what a member reads when the Logbuch refuses the boat
   * @returns the key of the lock reservation, or undefined if it could not be stored
   */
  public async lockResource(resource: AvatarInfo, reason: string, currentUser?: UserModel): Promise<string | undefined> {
    const reservation = newLockReservation(
      this.env.tenantId, resource,
      currentUser ? getAvatarInfoForCurrentUser(currentUser) : undefined,
      fill(this.i18n.lock_name(), { name: resource.name2 || resource.name1 }),
      reason.trim() || this.i18n.lock_defaultReason(),
    );
    return await this.create(reservation, currentUser);
  }

  /**
   * End the given lock reservations (findActiveLockReservations) as of today. 'completed' is not a
   * blocking state, so the resource is free again immediately; the reservation stays as history.
   * @returns true if every lock was ended
   */
  public async unlockResource(locks: ReservationModel[], currentUser?: UserModel): Promise<boolean> {
    let ok = true;
    for (const lock of locks) {
      const key = await this.update({ ...lock, state: 'completed', endDate: getTodayStr() }, currentUser);
      if (!key) ok = false;
    }
    return ok;
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
       component: OkrLabelSelectModal,
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
