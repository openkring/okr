import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { TripCollection, TripModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getTripIndex, newTripName } from '@bk2/trip-util';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class TripService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
  });

  public list(orderBy = 'startDate', sortOrder: 'asc' | 'desc' = 'desc'): Observable<TripModel[]> {
    return this.firestoreService.searchData<TripModel>(
      TripCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder
    );
  }

  public read(key: string): Observable<TripModel | undefined> {
    return findByKey<TripModel>(this.list(), key);
  }

  public async create(trip: TripModel, currentUser?: UserModel): Promise<string | undefined> {
    trip.name = newTripName(trip);
    trip.index = getTripIndex(trip);
    return this.firestoreService.createModel<TripModel>(
      TripCollection, trip, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public async update(trip: TripModel, currentUser?: UserModel): Promise<string | undefined> {
    trip.name = newTripName(trip);
    trip.index = getTripIndex(trip);
    return this.firestoreService.updateModel<TripModel>(
      TripCollection, trip, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public async softDelete(trip: TripModel, reason: string, photoUrl: string | undefined, currentUser?: UserModel): Promise<void> {
    trip.deletedAt = new Date().toISOString();
    trip.deletedBy = currentUser?.bkey ?? null;
    trip.state = 'deleted';
    trip.notes = trip.notes
      ? `${trip.notes}\n[Gelöscht: ${reason}${photoUrl ? ` | ${photoUrl}` : ''}]`
      : `[Gelöscht: ${reason}${photoUrl ? ` | ${photoUrl}` : ''}]`;
    await this.update(trip, currentUser);
  }
}
