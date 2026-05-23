import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { InvoiceModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { InvoiceEditForm, InvoiceEditFormI18n } from '@bk2/finance-invoice-ui';
import { PFX } from './scope';

const UI_PFX = '@finance/invoice/ui.';

@Component({
  selector: 'bk-invoice-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, InvoiceEditForm,
    IonContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]="true" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-invoice-edit-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [readOnly]="isReadOnly()"
          [isNew]="isNew()"
          [i18n]="formI18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class InvoiceEditModal {
  private readonly modalController = inject(ModalController);
  private readonly i18nService = inject(I18nService);
  private readonly allI18n = this.i18nService.translateAll({
    changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
    changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
    changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
    invoiceId_label:          UI_PFX + 'invoiceId.label',
    invoiceId_placeholder:    UI_PFX + 'invoiceId.placeholder',
    invoiceId_helper:         UI_PFX + 'invoiceId.helper',
    title_label:              UI_PFX + 'title.label',
    title_placeholder:        UI_PFX + 'title.placeholder',
    title_helper:             UI_PFX + 'title.helper',
    amount_label:             UI_PFX + 'amount.label',
    amount_placeholder:       UI_PFX + 'amount.placeholder',
    amount_helper:            UI_PFX + 'amount.helper',
    notes_label:              UI_PFX + 'notes.label',
    notes_placeholder:        UI_PFX + 'notes.placeholder',
    invoiceDate_label:        UI_PFX + 'invoiceDate.label',
    invoiceDate_placeholder:  UI_PFX + 'invoiceDate.placeholder',
    invoiceDate_helper:       UI_PFX + 'invoiceDate.helper',
    dueDate_label:            UI_PFX + 'dueDate.label',
    dueDate_placeholder:      UI_PFX + 'dueDate.placeholder',
    dueDate_helper:           UI_PFX + 'dueDate.helper',
    paymentDate_label:        UI_PFX + 'paymentDate.label',
    paymentDate_placeholder:  UI_PFX + 'paymentDate.placeholder',
    paymentDate_helper:       UI_PFX + 'paymentDate.helper',
    vatType_label:            UI_PFX + 'vatType.label',
    state_label:              UI_PFX + 'state.label',
  });

  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.allI18n.changeConfirmation_ok(),
    cancel: this.allI18n.changeConfirmation_cancel(),
    confirmation: this.allI18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  protected readonly formI18n: InvoiceEditFormI18n = this.allI18n;

  public readonly invoice = input.required<InvoiceModel>();
  public readonly currentUser = input.required<UserModel>();
  public readonly isNew = input.required<boolean>();
  public readonly readOnly = input(true);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formData = linkedSignal(() => safeStructuredClone(this.invoice()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.isReadOnly());

  protected readonly headerTitle = computed(() =>
    this.isNew() ? '@finance.invoice.operation.create.label' : '@finance.invoice.operation.update.label'
  );

  protected onFormDataChange(data: InvoiceModel): void {
    this.formData.set(data);
  }

  protected async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  protected async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
