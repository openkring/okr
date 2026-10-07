import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AccountModel, PaymentOrderModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { PAYMENT_I18N_KEYS, PaymentI18n } from '@okr/finance-payment-util';

import { PaymentOrderForm } from './payment-order.form';

@Component({
  selector: 'okr-payment-order-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, PaymentOrderForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-payment-order-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [accounts]="accounts()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class PaymentOrderEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(PAYMENT_I18N_KEYS) as PaymentI18n;

  // inputs
  public readonly order = input.required<PaymentOrderModel>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);
  /** accounts of the book to pick the debit (own bank) account from */
  public readonly accounts = input<AccountModel[]>([]);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.order()));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly headerTitle = computed(() =>
    this.isReadOnly() ? this.i18n.as_view() : (this.order().okey ? this.i18n.as_edit() : this.i18n.as_create()));
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.order()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: PaymentOrderModel): void {
    this.formData.set(formData);
  }
}
