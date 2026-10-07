import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, FunctionsError, getFunctions, httpsCallable } from 'firebase/functions';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { BILL_I18N_KEYS, BillI18n, BillQrScanFormModel, newBillQrScanFormModel } from '@okr/finance-bill-util';
import { BillQrScanForm } from '@okr/finance-bill-ui';

/**
 * Takes the content of a Swiss QR-bill and parses it through the parseQrInvoice callable;
 * dismisses with the parsed data and role 'confirm'. Stays in `feature`: it injects AppStore
 * (emulator switch) and calls the backend itself.
 */
@Component({
  selector: 'okr-bill-qr-scan-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, ChangeConfirmation, BillQrScanForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.qr_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-bill-qr-scan-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [processError]="processError()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class BillQrScanModal {
  // direct inject, no store: the bill store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(BILL_I18N_KEYS) as BillI18n;
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly functions = (() => {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.appStore.env.useEmulators) {
      connectFunctionsEmulator(fns, 'localhost', 5001);
    }
    return fns;
  })();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData = signal<BillQrScanFormModel>(newBillQrScanFormModel());
  protected showForm = signal(true);
  /** i18n key of the last failed attempt, shown under the field until the content changes */
  protected readonly processError = signal('');
  private readonly isProcessing = signal(false);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.isProcessing());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.qr_process(),
  } as ChangeConfirmationI18n));

  /** "Verarbeiten": parse the content; on failure stay open and show why under the field. */
  public async save(): Promise<void> {
    this.processError.set('');
    this.isProcessing.set(true);
    try {
      const fn = httpsCallable<{ qrContent: string }, unknown>(this.functions, 'parseQrInvoice');
      const result = await fn({ qrContent: this.formData().qrContent });
      await dismissOverlay(this.modalController, result.data, 'confirm');
    } catch (err) {
      console.error('BillQrScanModal.save: parseQrInvoice failed', err);
      const unreadable = (err as FunctionsError)?.code === 'functions/invalid-argument';
      this.processError.set(unreadable ? BILL_I18N_KEYS.qr_error_parse : BILL_I18N_KEYS.qr_error_failed);
    } finally {
      this.isProcessing.set(false);
    }
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.processError.set('');
    this.formData.set(newBillQrScanFormModel());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: BillQrScanFormModel): void {
    this.processError.set('');
    this.formData.set(formData);
  }
}
