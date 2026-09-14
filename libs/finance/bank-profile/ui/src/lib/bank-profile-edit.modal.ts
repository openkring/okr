import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AccountModel, BankProfileModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { BANK_PROFILE_I18N_KEYS, BankProfileI18n } from '@okr/finance-bank-profile-util';

import { BankProfileForm } from './bank-profile.form';

@Component({
  selector: 'okr-bank-profile-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, BankProfileForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-bank-profile-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
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
export class BankProfileEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(BANK_PROFILE_I18N_KEYS) as BankProfileI18n;

  public readonly profile = input.required<BankProfileModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.profile()));
  protected showForm = signal(true);

  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.profile().okey ? this.i18n.update() : this.i18n.create();
  });
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
    this.formData.set(safeStructuredClone(this.profile()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: BankProfileModel): void {
    this.formData.set(formData);
  }
}
