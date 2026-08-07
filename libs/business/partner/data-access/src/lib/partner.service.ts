import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { PartnerCollection, PartnerModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { getPartnerIndex } from '@okr/business-partner-util';
import { PFX } from './scope';

/**
 * CRUD for the partner registry (C3 §5) — bkaiser-side, in tenant `kring`.
 *
 * Deliberately **not** the write path for anything a partner's own installation reports:
 * `lastHeartbeatAt`, `reportedVersion` and the metering records are written by the ingest Cloud
 * Function with the Admin SDK. A client that could write them could also fake them.
 */
@Injectable({ providedIn: 'root' })
export class PartnerService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD --------------------------------*/
  public async create(partner: PartnerModel, currentUser?: UserModel): Promise<string | undefined> {
    partner.index = getPartnerIndex(partner);
    return await this.firestoreService.createModel<PartnerModel>(
      PartnerCollection, partner, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  public read(key: string): Observable<PartnerModel | undefined> {
    return findByKey<PartnerModel>(this.list(), key);
  }

  public async update(partner: PartnerModel, currentUser?: UserModel): Promise<string | undefined> {
    partner.index = getPartnerIndex(partner);
    return await this.firestoreService.updateModel<PartnerModel>(
      PartnerCollection, partner, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /** Archives rather than deletes — a terminated partner's ledger history must stay readable. */
  public async delete(partner: PartnerModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<PartnerModel>(
      PartnerCollection, partner, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /*-------------------------- LIST --------------------------------*/
  public list(orderBy = 'name', sortOrder: 'asc' | 'desc' = 'asc'): Observable<PartnerModel[]> {
    return this.firestoreService.searchData<PartnerModel>(
      PartnerCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }
}
