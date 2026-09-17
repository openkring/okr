import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AccountingConfigModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header, HeaderI18n } from '@okr/shared-ui';
import { safeStructuredClone } from '@okr/shared-util-core';

import { AccountService } from '@okr/finance-account-data-access';
import { VatCodeService } from '@okr/finance-vat-code-data-access';
import { AccountingConfigForm, FeeSchedule } from '@okr/finance-accounting-ui';

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
  imports: [Header, ChangeConfirmation, ReadOnlyBanner, AccountingConfigForm, FeeSchedule, IonContent],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="false" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      <okr-read-only-banner />
      @if (store.configLoaded() && formData(); as config) {
        <okr-accounting-config-form [formData]="config" (formDataChange)="formData.set($event)"
          [accounts]="accounts()" [tenantId]="store.tenantId()" [i18n]="store.i18n"
          [readOnly]="store.isExternallyManaged()" [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
        <!-- The fee schedule edits the same config object. The banner above already covers it,
             so this section brings none of its own — it only reports that the config is dirty. -->
        <okr-fee-schedule [formData]="config" (formDataChange)="onFeeScheduleChange($event)"
          [i18n]="store.i18n" [accounts]="accounts()" [vatCodes]="vatCodes()"
          [readOnly]="store.isExternallyManaged()" />
      }
    </ion-content>
  `
})
export class AccountingSettingsPage {
  protected readonly store = inject(AccountingStore);
  private readonly accountService = inject(AccountService);
  private readonly vatCodeService = inject(VatCodeService);

  private readonly accountsResource = rxResource({
    params: () => this.store.accountingTenantId(),
    stream: ({ params: accountingTenantId }) =>
      accountingTenantId ? this.accountService.list(accountingTenantId) : of([]),
  });
  protected readonly accounts = computed(() => this.accountsResource.value() ?? []);

  private readonly vatCodesResource = rxResource({
    params: () => this.store.accountingTenantId(),
    stream: ({ params: accountingTenantId }) =>
      accountingTenantId ? this.vatCodeService.list(accountingTenantId) : of([]),
  });
  protected readonly vatCodes = computed(() => this.vatCodesResource.value() ?? []);

  // A tenant may have no config document yet — edit a fresh one and create it on save. Only
  // meaningful once `configLoaded()` is true; before that `store.config()` is merely unread.
  private readonly config = computed(() =>
    this.store.config() ?? new AccountingConfigModel(this.store.tenantId(), this.store.accountingTenantId()));
  public formData = signal<AccountingConfigModel | undefined>(undefined);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);

  // Seeded, not derived: a `linkedSignal` over the config recomputes whenever the underlying
  // resource re-emits or restarts, which silently threw away whatever the user had typed (and,
  // when the restart also blanked `config()`, replaced it with an empty default model). Seeding
  // only while the form is untouched keeps live updates flowing without clobbering edits.
  private readonly seedFormData = effect(() => {
    if (!this.store.configLoaded()) return;
    const config = this.config();
    untracked(() => {
      if (this.formDirty()) return;
      this.formData.set(safeStructuredClone(config));
    });
  });

  protected showConfirmation = computed(() =>
    this.store.configLoaded() && this.formValid() && this.formDirty() && !this.store.isExternallyManaged());

  protected headerI18n = computed(() => ({ title: this.store.i18n.settings_title() } as HeaderI18n));
  protected changeConfirmationI18n = computed(() => ({
    cancel: this.store.i18n.cancel(), save: this.store.i18n.save()
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    const config = this.formData();
    // Never write from an unresolved read: `store.config()` is undefined both when no document
    // exists and when the read has not answered, and taking the second for the first sends an
    // empty default model into createModel (SCS-AY).
    if (!config || !this.store.configLoaded()) return;
    if (this.store.config()) {
      await this.store.updateConfig(config);
    } else {
      await this.store.createConfig(config);
    }
    this.formDirty.set(false);
  }

  /**
   * The fee-schedule section has no banner of its own, so it must mark the config dirty here —
   * otherwise its edits are valid, unsaved, and invisible to the confirmation above.
   */
  protected onFeeScheduleChange(config: AccountingConfigModel): void {
    this.formData.set(config);
    this.formDirty.set(true);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.config()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
