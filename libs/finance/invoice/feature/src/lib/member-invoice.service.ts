import { inject, Injectable } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { AppStore } from '@okr/shared-feature';
import { MembershipModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { getTodayStr } from '@okr/shared-util-core';
import { showToast } from '@okr/shared-util-angular';

import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { InvoiceService } from '@okr/finance-invoice-data-access';
import { INVOICE_I18N_KEYS, InvoiceI18n, invoiceRefusalReasons, invoiceRefusalText, newMemberInvoice } from '@okr/finance-invoice-util';

import { InvoiceEditModal, InvoiceEditResult } from './invoice-edit.modal';

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
  private readonly i18n = inject(I18nService).translateAll(INVOICE_I18N_KEYS) as InvoiceI18n;

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
    const { data, role } = await modal.onWillDismiss<InvoiceEditResult>();
    if (role === 'confirm' && data) await this.createDraft(data);
  }

  /**
   * Saves a new native draft with its positions through `writeInvoice`; the number is assigned when it
   * is issued. Toasts the outcome; returns the new key, or undefined when the server refused.
   */
  public async createDraft(data: InvoiceEditResult): Promise<string | undefined> {
    try {
      const key = await this.invoiceService.create(data.invoice, data.positions, this.appStore.currentUser() ?? undefined);
      await showToast(this.toastController, this.i18n.create_conf());
      return key;
    } catch (e) {
      console.error('MemberInvoiceService.createDraft: writeInvoice failed', e);
      await showToast(this.toastController, invoiceRefusalText(invoiceRefusalReasons(e), this.i18n, this.i18n.create_error()));
      return undefined;
    }
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
