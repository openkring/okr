import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { BillCollection, BillModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';
import { ActivityService } from '@okr/activity-data-access';

import { getBillIndex } from '@okr/finance-bill-util';

const PFX = '@finance/bill/data-access.';

@Injectable({
  providedIn: 'root'
})
export class BillService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  public list(): Observable<BillModel[]> {
    return this.firestoreService.searchData<BillModel>(
      BillCollection,
      getSystemQuery(this.env.tenantId),
      'billDate',
      'desc'
    );
  }

  public read(key: string): Observable<BillModel | undefined> {
    return findByKey<BillModel>(this.list(), key);
  }

  public async create(bill: BillModel, currentUser?: UserModel): Promise<string | undefined> {
    bill.index = getBillIndex(bill);
    const key = await this.firestoreService.createModel<BillModel>(BillCollection, bill, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('bill', 'create', currentUser, `${key}: ${bill.billId}`);
    return key;
  }

  public async update(bill: BillModel, currentUser?: UserModel): Promise<string | undefined> {
    bill.index = getBillIndex(bill);
    const key = await this.firestoreService.updateModel<BillModel>(BillCollection, bill, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('bill', 'update', currentUser, `${key}: ${bill.billId}`);
    return key;
  }

  public async delete(bill: BillModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<BillModel>(BillCollection, bill, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('bill', 'delete', currentUser, `${bill.okey}: ${bill.billId}`);
  }
}
