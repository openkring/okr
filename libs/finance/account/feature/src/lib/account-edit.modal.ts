import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { AccountModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { AccountForm } from '@okr/finance-account-ui';
import { withCostCenterForAccountId } from '@okr/finance-account-util';
import { dismissOverlay } from '@okr/shared-util-angular';
import { CostCenterStore } from '@okr/finance-cost-center-feature';
import { AccountStore } from './account.store';

/**
 * A clone to edit. Legacy scs accounts store `tags` as an array (`[]`) instead of the comma string the
 * model declares; the Vest suite rejects that as notString on a field the form never shows, so the
 * save banner silently never appeared. Saving writes the repaired string back.
 */
function cloneAccount(account: AccountModel): AccountModel | undefined {
  const _clone = safeStructuredClone(account);
  if (!_clone) return _clone;
  const _tags = _clone.tags as unknown;
  if (Array.isArray(_tags)) _clone.tags = _tags.join(',');
  return _clone;
}

@Component({
  selector: 'okr-account-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, AccountForm,
    IonContent
  ],
  providers: [AccountStore],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if(showForm() && formData(); as formData) {
        <okr-account-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [types]="types()"
          [accounts]="store.accounts()"
          [costCenters]="costCenterStore.costCenters()"
          [costCentersEnabled]="costCenterStore.isEnabled()"
          [bookDefaultCostCenterKey]="bookDefaultCostCenterKey()"
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
  protected readonly costCenterStore = inject(CostCenterStore);

  public account = input.required<AccountModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  // the accounting-wide fallback Kostenstelle; legacy configs lack the field
  protected readonly bookDefaultCostCenterKey = computed(() => this.store.accountingStore.config()?.defaultCostCenterKey ?? '');

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  public formData = linkedSignal(() => cloneAccount(this.account()));
  protected showForm = signal(true);

  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.store.i18n.view();
    const key = this.account().okey;
    return (key && key.length > 0) ? this.store.i18n.update() : this.store.i18n.create();
  });
  protected types = computed(() => this.store.appStore.getCategory('account_type'));
  protected tenantId = computed(() => this.store.appStore.tenantId());

  public async save(): Promise<void> {
    await dismissOverlay(this.store.modalController, this.formData() ? withCostCenterForAccountId(this.formData() as AccountModel) : this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(cloneAccount(this.account()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: AccountModel): void {
    this.formData.set(formData);
  }
}
