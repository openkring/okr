import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { PaymentCollection, PaymentModel, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(payment: PaymentModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<PaymentModel>(
      PaymentCollection, payment,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public async update(payment: PaymentModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<PaymentModel>(
      PaymentCollection, payment, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public listForOrder(paymentOrderKey: string, accountingTenantId: string): Observable<PaymentModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'paymentOrderKey',   operator: '==' as const, value: paymentOrderKey   },
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<PaymentModel>(PaymentCollection, query);
  }
}
