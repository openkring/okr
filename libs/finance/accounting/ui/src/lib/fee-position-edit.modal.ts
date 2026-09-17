import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AccountModel, FeePositionRule, VatCodeModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { dismissOverlay } from '@okr/shared-util-angular';

import { AccountingI18n } from '@okr/finance-accounting-util';

import { FeePositionForm } from './fee-position.form';

/**
 * Edits one position of the fee schedule. A pure container: it takes a copy of the position,
 * hands it to the form, and dismisses the edited copy — the settings page writes it back into
 * `feeSchedule` and saves the whole config.
 */
@Component({
  selector: 'okr-fee-position-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, FeePositionForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-fee-position-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [tenantId]="tenantId()"
          [accounts]="accounts()"
          [vatCodes]="vatCodes()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class FeePositionEditModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly position = input.required<FeePositionRule>();
  public readonly i18n = input.required<AccountingI18n>();
  public readonly tenantId = input.required<string>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.position()));
  protected showForm = signal(true);

  // derived
  protected readonly headerTitle = computed(() => this.i18n().feeSchedule_title());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.isReadOnly());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.position()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: FeePositionRule): void {
    this.formData.set(formData);
  }
}
