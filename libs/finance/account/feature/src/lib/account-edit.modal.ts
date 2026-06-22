import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { AccountModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { AccountForm } from '@bk2/finance-account-ui';
import { AccountStore } from './account.store';

@Component({
  selector: 'bk-account-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, AccountForm,
    IonContent
  ],
  providers: [AccountStore],
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
          [i18n]="store.i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class AccountEditModal {
  protected readonly store = inject(AccountStore);

  public account = input.required<AccountModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  public formData = linkedSignal(() => safeStructuredClone(this.account()));
  protected showForm = signal(true);

  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.store.i18n.view();
    const key = this.account().bkey;
    return (key && key.length > 0) ? this.store.i18n.update() : this.store.i18n.create();
  });
  protected types = computed(() => this.store.appStore.getCategory('account_type'));
  protected tenantId = computed(() => this.store.appStore.tenantId());

  public async save(): Promise<void> {
    await this.store.modalController.dismiss(this.formData(), 'confirm');
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
