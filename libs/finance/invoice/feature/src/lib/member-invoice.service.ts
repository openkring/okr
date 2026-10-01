import { inject, Injectable } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { AppStore } from '@okr/shared-feature';
import { InvoiceModel, MembershipModel } from '@okr/shared-models';
import { getTodayStr } from '@okr/shared-util-core';
import { showToast } from '@okr/shared-util-angular';

import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { InvoiceService } from '@okr/finance-invoice-data-access';
import { newMemberInvoice, withInvoiceNo } from '@okr/finance-invoice-util';

import { InvoiceEditModal } from './invoice-edit.modal';

/**
 * "Rechnung erstellen" for a member: in bexio while the own books are bexio-managed, natively after
 * the cut-over (spec 1.68) — an invoice created in bexio then would never reach okr again.
 */
@Injectable({ providedIn: 'root' })
export class MemberInvoiceService {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly configService = inject(AccountingConfigService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly appStore = inject(AppStore);

  public async createFor(membership: MembershipModel): Promise<void> {
    const tenantId = this.appStore.tenantId();
    // the own books: accountingTenantId = okr tenant (accounting skill)
    const config = await firstValueFrom(this.configService.read(tenantId).pipe(take(1)));
    if (config?.accountingBackend === 'bexio') {
      await this.createInBexio(membership);
      return;
    }
    const currentUser = this.appStore.currentUser();
    if (!currentUser) return;
    const modal = await this.modalController.create({
      component: InvoiceEditModal,
      componentProps: {
        invoice: newMemberInvoice(tenantId, tenantId, membership, getTodayStr()),
        currentUser,
        isNew: true,
        readOnly: false,
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<InvoiceModel>();
    if (role === 'confirm' && data) await this.createNumbered(data);
  }

  /** Saves a new native invoice with its sequential number (per fiscal year and accounting tenant). */
  public async createNumbered(invoice: InvoiceModel): Promise<string | undefined> {
    const year = Number((invoice.invoiceDate || getTodayStr()).substring(0, 4));
    const no = invoice.invoiceNo > 0 ? invoice.invoiceNo : await this.invoiceService.nextInvoiceNo(year, invoice.accountingTenantId);
    return this.invoiceService.create(withInvoiceNo(invoice, no), this.appStore.currentUser() ?? undefined);
  }

  private async createInBexio(membership: MembershipModel): Promise<void> {
    const { InvoiceNewModal } = await import('./invoice-new.modal');
    const modal = await this.modalController.create({
      component: InvoiceNewModal,
      cssClass: 'wide-modal',
      componentProps: { membership },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<{ id: string }>();
    if (role === 'confirm' && data) await showToast(this.toastController, '@finance.invoice.operation.create.conf');
  }
}
