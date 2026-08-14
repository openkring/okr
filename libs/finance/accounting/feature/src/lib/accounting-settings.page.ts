import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AccountingConfigModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header, HeaderI18n } from '@okr/shared-ui';
import { safeStructuredClone } from '@okr/shared-util-core';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingConfigForm } from '@okr/finance-accounting-ui';

import { AccountingStore } from './accounting.store';
import { ReadOnlyBanner } from './read-only-banner';

/**
 * Settings of one accounting tenant. Today this is the account-link page: it is the only place that
 * writes `defaultExpenseAccountKey` / `employeePayablesAccountKey`, which the expense→booking
 * posting falls back to. Further config (currency, fiscal year, VAT method) can join this form.
 */
@Component({
  selector: 'okr-accounting-settings-page',
  standalone: true,
  imports: [Header, ChangeConfirmation, ReadOnlyBanner, AccountingConfigForm, IonContent],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="false" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      <okr-read-only-banner />
      @if (formData(); as config) {
        <okr-accounting-config-form [formData]="config" (formDataChange)="formData.set($event)"
          [accounts]="accounts()" [tenantId]="store.tenantId()" [i18n]="store.i18n"
          [readOnly]="store.isExternallyManaged()" [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `
})
export class AccountingSettingsPage {
  protected readonly store = inject(AccountingStore);
  private readonly accountService = inject(AccountService);

  private readonly accountsResource = rxResource({
    params: () => this.store.accountingTenantId(),
    stream: ({ params: accountingTenantId }) =>
      accountingTenantId ? this.accountService.list(accountingTenantId) : of([]),
  });
  protected readonly accounts = computed(() => this.accountsResource.value() ?? []);

  // A tenant may have no config document yet — edit a fresh one and create it on save.
  private readonly config = computed(() =>
    this.store.config() ?? new AccountingConfigModel(this.store.tenantId(), this.store.accountingTenantId()));
  public formData = linkedSignal(() => safeStructuredClone(this.config()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.store.isExternallyManaged());

  protected headerI18n = computed(() => ({ title: this.store.i18n.settings_title() } as HeaderI18n));
  protected changeConfirmationI18n = computed(() => ({
    cancel: this.store.i18n.cancel(), save: this.store.i18n.save()
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    const config = this.formData();
    if (!config) return;
    if (this.store.config()) {
      await this.store.updateConfig(config);
    } else {
      await this.store.createConfig(config);
    }
    this.formDirty.set(false);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.config()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
