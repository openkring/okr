import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AccountModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { ACCOUNT_I18N_KEYS, AccountI18n } from '@bk2/finance-account-util';

import { AccountForm } from '@bk2/finance-account-ui';

@Component({
  selector: 'bk-account-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, AccountForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if(showForm() && formData(); as formData) {
        <bk-account-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [types]="types()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class AccountEditModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(ACCOUNT_I18N_KEYS) as AccountI18n;

  public account = input.required<AccountModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));
  public formData = linkedSignal(() => safeStructuredClone(this.account()));
  protected showForm = signal(true);

  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.as_view();
    const key = this.account().bkey;
    return (key && key.length > 0) ? this.i18n.as_edit() : this.i18n.as_create();
  });
  protected types = computed(() => this.appStore.getCategory('account_type'));
  protected tenantId = computed(() => this.appStore.tenantId());

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.account()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: AccountModel): void {
    this.formData.set(formData);
  }
}
