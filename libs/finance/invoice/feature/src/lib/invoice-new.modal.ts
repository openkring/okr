import { Component, inject, input, linkedSignal, computed, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { I18nService } from '@bk2/shared-i18n';
import { MembershipModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { showToast } from '@bk2/shared-util-angular';

import { PFX } from './scope';
import { BexioInvoiceFormModel, BexioInvoicePosition, newInvoiceFormModel } from '@bk2/finance-invoice-util';
import { BexioInvoiceNewForm } from '@bk2/finance-invoice-ui';

@Component({
  selector: 'bk-invoice-new-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, BexioInvoiceNewForm,
    IonContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <bk-header [i18n]="{ title: '@finance.invoice.operation.create.label' }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]="true" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-bexio-invoice-new-form
        [formData]="formData()"
        (formDataChange)="onFormDataChange($event)"
        [readOnly]="false"
        (dirty)="formDirty.set($event)"
        (valid)="formValid.set($event)"
      />
    </ion-content>
  `
})
export class InvoiceNewModal {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly i18nService = inject(I18nService);
  private readonly confirmI18n = this.i18nService.translateAll({
    changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
    changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
    changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.confirmI18n.changeConfirmation_ok(),
    cancel: this.confirmI18n.changeConfirmation_cancel(),
    confirmation: this.confirmI18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  public readonly membership = input.required<MembershipModel>();

  protected formData = linkedSignal<BexioInvoiceFormModel>(() =>
    newInvoiceFormModel(this.membership())
  );
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());

  protected onFormDataChange(data: BexioInvoiceFormModel): void {
    this.formData.set(data);
  }

  protected async save(): Promise<void> {
    const data = this.formData();
    const functions = getFunctions(getApp(), 'europe-west6');
    const fn = httpsCallable<{
      title: string;
      bexioId: string;
      header: string;
      footer: string;
      validFrom: string;
      validTo: string;
      positions: BexioInvoicePosition[];
      template_slug: string;
    }, { id: string }>(functions, 'createBexioInvoice');

    try {
      const result = await fn({
        title: data.title,
        bexioId: data.bexioId,
        header: data.header,
        footer: data.footer,
        validFrom: data.validFrom,
        validTo: data.validTo,
        positions: data.positions,
        template_slug: data.template_slug,
      });
      await this.modalController.dismiss({ id: result.data.id }, 'confirm');
    } catch (error) {
      console.error('BexioInvoiceNewModal.save: createBexioInvoice failed', error);
      await showToast(this.toastController, '@finance.invoice.operation.create.error');
    }
  }

  protected async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
