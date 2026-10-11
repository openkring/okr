import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { PaymentOrderCollection, PaymentOrderModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class PaymentOrderService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf: PFX + 'order.create.conf',
    create_error: PFX + 'order.create.error',
    update_conf: PFX + 'order.update.conf',
    update_error: PFX + 'order.update.error',
  });
  private readonly tenantId = this.env.tenantId;

  public async create(order: PaymentOrderModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<PaymentOrderModel>(
      PaymentOrderCollection, order,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<PaymentOrderModel | undefined> {
    return this.firestoreService.readTenantModel<PaymentOrderModel>(PaymentOrderCollection, key, this.tenantId).pipe(
      map(model => model?.accountingTenantId === accountingTenantId ? model : undefined)
    );
  }

  public async update(order: PaymentOrderModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<PaymentOrderModel>(
      PaymentOrderCollection, order, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'executionDate', sortOrder = 'desc'): Observable<PaymentOrderModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<PaymentOrderModel>(PaymentOrderCollection, query, orderBy, sortOrder);
  }

  /** Approval is server-side only (status changes are denied to clients by the rules). Throws the callable's HttpsError. */
  public async approve(orderKey: string): Promise<void> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'approvePaymentOrder');
    await fn({ paymentOrderKey: orderKey });
  }

  public async generatePain001(orderKey: string): Promise<string> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'generatePain001');
    const result = await fn({ paymentOrderKey: orderKey });
    return (result.data as { xml: string }).xml;
  }
}
