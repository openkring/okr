import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { TripCollection, TripModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { getTripIndex, newTripName } from '@okr/trip-util';
import { PFX } from './scope';

/** Payload of the `reportIncident` callable — mirrors ReportIncidentData in apps/functions/src/trip/report.ts. */
export interface ReportIncidentPayload {
  tenantId: string;
  kind: 'damage' | 'bug';
  message: string;
  personKey?: string;
  personName?: string;
  boatKey?: string;
  boatName?: string;
  tripKey?: string;
  tripName?: string;
}

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

  /**
   * Report a damage ('Schadenmeldung') or a bug ('Fehlermeldung').
   *
   * The report is NOT written here: the `reportIncident` callable emits the workflow event
   * ('trip.damageReported' / 'trip.bugReported') and the tenant's workflow rules decide what
   * happens — a task for the responsible person, an email, a chat message. What used to be a
   * hard-coded responsibility lookup by name in TripStore is now configuration.
   */
  public async reportIncidentViaFunction(payload: ReportIncidentPayload): Promise<string> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'reportIncident');
    const result = await fn(payload);
    return (result.data as { event: string }).event;
  }

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
    trip.deletedBy = currentUser?.okey ?? null;
    trip.state = 'deleted';
    trip.notes = trip.notes
      ? `${trip.notes}\n[Gelöscht: ${reason}${photoUrl ? ` | ${photoUrl}` : ''}]`
      : `[Gelöscht: ${reason}${photoUrl ? ` | ${photoUrl}` : ''}]`;
    await this.update(trip, currentUser);
  }
}
