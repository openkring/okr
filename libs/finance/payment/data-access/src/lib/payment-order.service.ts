import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { PaymentOrderCollection, PaymentOrderModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class PaymentOrderService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(order: PaymentOrderModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<PaymentOrderModel>(
      PaymentOrderCollection, order,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<PaymentOrderModel | undefined> {
    return findByKey<PaymentOrderModel>(this.list(accountingTenantId), key);
  }

  public async update(order: PaymentOrderModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<PaymentOrderModel>(
      PaymentOrderCollection, order, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'executionDate', sortOrder = 'desc'): Observable<PaymentOrderModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<PaymentOrderModel>(PaymentOrderCollection, query, orderBy, sortOrder);
  }

  public async approve(order: PaymentOrderModel, approverId: string, currentUser?: UserModel): Promise<void> {
    order.approvedBy = approverId;
    order.status = 'approved';
    await this.update(order, currentUser);
  }
}
