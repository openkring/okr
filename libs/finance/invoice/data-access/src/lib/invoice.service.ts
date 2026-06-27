import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { InvoiceCollection, InvoiceModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';
import { ActivityService } from '@bk2/activity-data-access';

import { getInvoiceIndex } from '@bk2/finance-invoice-util';
const PFX = '@finance/invoice/data-access.';

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
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

  public async create(invoice: InvoiceModel, currentUser?: UserModel): Promise<string | undefined> {
    invoice.index = getInvoiceIndex(invoice);
    const key = await this.firestoreService.createModel<InvoiceModel>(InvoiceCollection, invoice, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('invoice', 'create', currentUser, `${key}: ${invoice.invoiceId}`);
    return key;
  }

  public read(key: string): Observable<InvoiceModel | undefined> {
    return findByKey<InvoiceModel>(this.list(), key);
  }

  public async update(invoice: InvoiceModel, currentUser?: UserModel): Promise<string | undefined> {
    invoice.index = getInvoiceIndex(invoice);
    const key = await this.firestoreService.updateModel<InvoiceModel>(InvoiceCollection, invoice, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('invoice', 'update', currentUser, `${key}: ${invoice.invoiceId}`);
    return key;
  }

  public async delete(invoice: InvoiceModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<InvoiceModel>(InvoiceCollection, invoice, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('invoice', 'delete', currentUser, `${invoice.bkey}: ${invoice.invoiceId}`);
  }

  public async nextInvoiceNo(year: number, accountingTenantId: string): Promise<number> {
    const all = await this.firestoreService.getDataOnce<InvoiceModel>(InvoiceCollection, getSystemQuery(this.env.tenantId), 'invoiceDate', 'desc');
    const maxNo = all
      .filter(inv => inv.accountingTenantId === accountingTenantId)
      .map(inv => inv.invoiceNo ?? 0)
      .filter(no => Math.floor(no / 100000) === year)
      .reduce((max, n) => Math.max(max, n), 0);
    return maxNo > 0 ? maxNo + 1 : year * 100000 + 1;
  }

  private list(): Observable<InvoiceModel[]> {
    return this.firestoreService.searchData<InvoiceModel>(InvoiceCollection, getSystemQuery(this.env.tenantId), 'invoiceDate', 'desc');
  }
}
