import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AccountModel, BankImportRowModel, UserModel, VatCodeModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { BANK_IMPORT_I18N_KEYS, BankImportI18n } from '@okr/finance-bank-import-util';

import { BankImportRowForm } from './bank-import-row.form';

@Component({
  selector: 'okr-bank-import-row-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, BankImportRowForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.assign_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-bank-import-row-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [accounts]="accounts()"
          [vatCodes]="vatCodes()"
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
export class BankImportRowEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(BANK_IMPORT_I18N_KEYS) as BankImportI18n;

  public readonly row = input.required<BankImportRowModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly readOnly = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.row()));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.row()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: BankImportRowModel): void {
    this.formData.set(formData);
  }
}
