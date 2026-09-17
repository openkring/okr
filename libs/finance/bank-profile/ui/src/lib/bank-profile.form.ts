import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES } from '@okr/shared-constants';
import { AccountModel, BankFormat, BankProfileModel, RoleName, UserModel } from '@okr/shared-models';
import { ErrorNote, IbanInput, IbanInputI18n, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { BankProfileI18n, bankProfileValidations } from '@okr/finance-bank-profile-util';

const FORMATS: BankFormat[] = ['postfinance', 'zkb', 'yuh', 'vz', 'gkb', 'swissquote', 'raisenow'];
const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP'];

@Component({
  selector: 'okr-bank-profile-form',
  standalone: true,
  imports: [TextInput, IbanInput, NotesInput, StringSelect, AccountSelect, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="formatI18n()" [stringList]="formats" [labels]="formatLabels()"
                    [selectedString]="format()" (selectedStringChange)="onFieldChange('format', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="formatErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-iban [i18n]="ibanI18n()" [value]="iban()" (valueChange)="onFieldChange('iban', normalizeIban($event))"
                    [maxLength]="34" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="ibanErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="bankNameI18n()" [value]="bankName()" (valueChange)="onFieldChange('bankName', $event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="bankNameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="currencyI18n()" [stringList]="currencies"
                    [selectedString]="currency()" (selectedStringChange)="onFieldChange('currency', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="currencyErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()" [allowEmpty]="false"
                    [selectedKey]="accountKey()" (selectedKeyChange)="onFieldChange('accountKey', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="accountKeyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="feeAccountI18n()" [accounts]="accounts()" [allowEmpty]="true"
                    [selectedKey]="feeAccountKey()" (selectedKeyChange)="onFieldChange('feeAccountKey', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="feeAccountKeyErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        @if (hasRole('treasurer') || hasRole('admin')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class BankProfileForm {
  public readonly i18n = input.required<BankProfileI18n>();
  public formData = model.required<BankProfileModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly formats = FORMATS;
  protected readonly currencies = CURRENCIES;

  protected readonly bankProfileForm = form(this.formData, (path) => validateVestTree(path, bankProfileValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.bankProfileForm().valid()));
  }

  /** Vest messages of the field, shown in red right under it (the bar alone never said why it left) */
  protected readonly formatErrors = computed(() => this.bankProfileForm.format().errors().map(e => e.message ?? ''));
  protected readonly ibanErrors = computed(() => this.bankProfileForm.iban().errors().map(e => e.message ?? ''));
  protected readonly bankNameErrors = computed(() => this.bankProfileForm.bankName().errors().map(e => e.message ?? ''));
  protected readonly currencyErrors = computed(() => this.bankProfileForm.currency().errors().map(e => e.message ?? ''));
  protected readonly accountKeyErrors = computed(() => this.bankProfileForm.accountKey().errors().map(e => e.message ?? ''));
  protected readonly feeAccountKeyErrors = computed(() => this.bankProfileForm.feeAccountKey().errors().map(e => e.message ?? ''));

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly format = computed(() => this.formData()?.format ?? 'postfinance');
  protected readonly iban = computed(() => this.formData()?.iban ?? '');
  protected readonly bankName = computed(() => this.formData()?.bankName ?? '');
  protected readonly currency = computed(() => this.formData()?.currency ?? 'CHF');
  protected readonly accountKey = computed(() => this.formData()?.accountKey ?? '');
  protected readonly feeAccountKey = computed(() => this.formData()?.feeAccountKey ?? '');
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);

  protected readonly formatLabels = computed(() => [
    this.i18n().format_postfinance(), this.i18n().format_zkb(), this.i18n().format_yuh(), this.i18n().format_vz(), this.i18n().format_gkb(), this.i18n().format_swissquote(), this.i18n().format_raisenow(),
  ]);
  protected readonly formatI18n = computed(() => ({ name: 'format', label: this.i18n().format_label(), helper: this.i18n().format_helper() } as StringSelectI18n));
  protected readonly ibanI18n = computed(() => ({ name: 'iban', label: this.i18n().iban_label(), placeholder: this.i18n().iban_placeholder(), helper: this.i18n().iban_helper() } as IbanInputI18n));
  protected readonly bankNameI18n = computed(() => ({ name: 'bankName', label: this.i18n().bankName_label(), placeholder: this.i18n().bankName_placeholder(), helper: this.i18n().bankName_helper() } as TextInputI18n));
  protected readonly currencyI18n = computed(() => ({ name: 'currency', label: this.i18n().currency_label(), helper: this.i18n().currency_helper() } as StringSelectI18n));
  protected readonly accountI18n = computed(() => ({ name: 'accountKey', label: this.i18n().account_label(), helper: this.i18n().account_helper() } as AccountSelectI18n));
  protected readonly feeAccountI18n = computed(() => ({ name: 'feeAccountKey', label: this.i18n().feeAccount_label(), helper: this.i18n().feeAccount_helper() } as AccountSelectI18n));
  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));

  protected normalizeIban(value: string): string {
    return (value ?? '').replace(/\s+/g, '').toUpperCase();
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
