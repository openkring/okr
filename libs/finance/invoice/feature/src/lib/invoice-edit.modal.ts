import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';

import { InvoiceModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { InvoiceEditForm } from '@bk2/finance-invoice-ui';
import { InvoiceStore } from './invoice.store';

@Component({
  selector: 'bk-invoice-edit-modal',
  standalone: true,
  providers: [InvoiceStore],
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
          [i18n]="store.i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class InvoiceEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(InvoiceStore);

  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

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
