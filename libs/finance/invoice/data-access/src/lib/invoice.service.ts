import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { InvoiceCollection, InvoiceModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';
import { ActivityService } from '@bk2/activity-data-access';

import { getInvoiceIndex } from '@bk2/finance-invoice-util';

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);

  public async create(invoice: InvoiceModel, currentUser?: UserModel): Promise<string | undefined> {
    invoice.index = getInvoiceIndex(invoice);
    const key = await this.firestoreService.createModel<InvoiceModel>(InvoiceCollection, invoice, '@invoice.operation.create', currentUser);
    void this.activityService.log('invoice', 'create', currentUser, `${key}: ${invoice.invoiceId}`);
    return key;
  }

  public read(key: string): Observable<InvoiceModel | undefined> {
    return findByKey<InvoiceModel>(this.list(), key);
  }

  public async update(invoice: InvoiceModel, currentUser?: UserModel): Promise<string | undefined> {
    invoice.index = getInvoiceIndex(invoice);
    const key = await this.firestoreService.updateModel<InvoiceModel>(InvoiceCollection, invoice, false, '@invoice.operation.update', currentUser);
    void this.activityService.log('invoice', 'update', currentUser, `${key}: ${invoice.invoiceId}`);
    return key;
  }

  public async delete(invoice: InvoiceModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<InvoiceModel>(InvoiceCollection, invoice, '@invoice.operation.delete', currentUser);
    void this.activityService.log('invoice', 'delete', currentUser, `${invoice.bkey}: ${invoice.invoiceId}`);
  }

  private list(): Observable<InvoiceModel[]> {
    return this.firestoreService.searchData<InvoiceModel>(InvoiceCollection, getSystemQuery(this.env.tenantId), 'invoiceDate', 'desc');
  }
}
