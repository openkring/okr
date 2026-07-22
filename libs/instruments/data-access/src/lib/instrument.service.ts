import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { InstrumentCollection, InstrumentModel, InstrumentType, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { getInstrumentIndex } from '@okr/instruments-util';
import { ActivityService } from '@okr/activity-data-access';
import { PFX } from './scope';

/**
 * The single Firestore gateway for the `instruments` collection (spec §2.24). All four grid
 * instruments (SWOT / PESTEL / BMC / Eisenhower) share this collection, discriminated by `type`.
 */
@Injectable({ providedIn: 'root' })
export class InstrumentService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);

  protected readonly i18n = this.i18nService.translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf: PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  /*-------------------------- CRUD --------------------------------*/

  public async create(instrument: InstrumentModel, currentUser: UserModel | undefined): Promise<string | undefined> {
    instrument.index = getInstrumentIndex(instrument);
    const key = await this.firestoreService.createModel<InstrumentModel>(InstrumentCollection, instrument, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('instrument', 'create', currentUser, `${key}: ${instrument.name}/${instrument.type}`);
    return key;
  }

  public read(key: string | undefined): Observable<InstrumentModel | undefined> {
    return findByKey<InstrumentModel>(this.list(), key);
  }

  public async update(instrument: InstrumentModel, currentUser?: UserModel): Promise<string | undefined> {
    instrument.index = getInstrumentIndex(instrument);
    const key = await this.firestoreService.updateModel<InstrumentModel>(InstrumentCollection, instrument, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('instrument', 'update', currentUser, `${key}: ${instrument.name}/${instrument.type}`);
    return key;
  }

  public async delete(instrument: InstrumentModel, currentUser?: UserModel): Promise<void> {
    const payload = `${instrument.okey}: ${instrument.name}/${instrument.type}`;
    await this.firestoreService.deleteModel<InstrumentModel>(InstrumentCollection, instrument, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('instrument', 'delete', currentUser, payload);
  }

  /*-------------------------- board (topics) --------------------------------*/

  /**
   * Persist the embedded `topics[]` after a board mutation (drag / add / edit / delete a card).
   * Deliberately not `update()`: a board edit is not a form save, so we write only `topics` and the
   * recomputed `index`, silently (no confirmation toast). Topics are an embedded array, so the whole
   * array is written — Firestore cannot patch a single array element. The activity log keeps a trail.
   */
  public async saveTopics(instrument: InstrumentModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateObject(InstrumentCollection, instrument.okey, {
      topics: instrument.topics,
      index: getInstrumentIndex(instrument),
    }, false);
    void this.activityService.log('instrument', 'update', currentUser, `${instrument.okey}: topics`);
  }

  /*-------------------------- list / query --------------------------------*/

  /** All instruments for the tenant. */
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<InstrumentModel[]> {
    return this.firestoreService.searchData(InstrumentCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /** Instruments of one type (the list partition, e.g. all SWOTs). */
  public listByType(type: InstrumentType, orderBy = 'name', sortOrder = 'asc'): Observable<InstrumentModel[]> {
    return this.list(orderBy, sortOrder).pipe(
      map(instruments => instruments.filter(instrument => instrument.type === type)),
    );
  }
}
