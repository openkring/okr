import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';

import { AccountModel, BankImportRowModel, VatCodeModel } from '@okr/shared-models';
import { ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { BankImportI18n, bankImportRowValidations } from '@okr/finance-bank-import-util';

/**
 * The one-off assignment form for a single staging row (spec 1.60 §5.2). Date/payee/rawText/
 * amount are the bank's own data — shown read-only, never editable — only title, the
 * counter-account and the VAT code are form inputs. No notes/chips: a staging row is not a
 * record worth annotating.
 */
@Component({
  selector: 'okr-bank-import-row-form',
  standalone: true,
  imports: [TextInput, StringSelect, AccountSelect, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, DecimalPipe],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-item lines="full">
              <ion-label>
                {{ dateLabel() }}
                @if (formData().payee) {
                  · {{ formData().payee }}
                }
                · {{ formData().rawText }} ·
                {{ formData().amount.amount / 100 | number:'1.2-2' }} {{ formData().amount.currency }}
                @if (formData().fee.amount) {
                  <!-- read-only like every other bank figure: the fee comes from the file, not from the treasurer -->
                  · {{ i18n().fee_label() }} {{ formData().fee.amount / 100 | number:'1.2-2' }}
                  · {{ i18n().fee_net_label() }} {{ (formData().amount.amount - formData().fee.amount) / 100 | number:'1.2-2' }}
                }
              </ion-label>
            </ion-item>
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="100" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()" [allowEmpty]="false"
                    [selectedKey]="accountKey()" (selectedKeyChange)="onFieldChange('accountKey', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="accountKeyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="vatCodeI18n()" [stringList]="vatCodeKeys()" [labels]="vatCodeLabels()"
                    [selectedString]="vatCodeKey()" (selectedStringChange)="onFieldChange('vatCodeKey', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class BankImportRowForm {
  public readonly i18n = input.required<BankImportI18n>();
  public formData = model.required<BankImportRowModel>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly bankImportRowForm = form(this.formData, (path) => validateVestTree(path, bankImportRowValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.bankImportRowForm().valid()));
  }

  /** Vest messages of the field, shown in red right under it (the bar alone never said why it left) */
  protected readonly titleErrors = computed(() => this.bankImportRowForm.title().errors().map(e => e.message ?? ''));
  protected readonly accountKeyErrors = computed(() => this.bankImportRowForm.accountKey().errors().map(e => e.message ?? ''));

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly dateLabel = computed(() => convertDateFormatToString(this.formData()?.date, DateFormat.StoreDate, DateFormat.ViewDate, false));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly accountKey = computed(() => this.formData()?.accountKey ?? '');
  protected readonly vatCodeKey = computed(() => this.formData()?.vatCodeKey ?? '');

  protected readonly vatCodeKeys = computed(() => ['', ...this.vatCodes().map((v) => v.okey)]);
  protected readonly vatCodeLabels = computed(() => ['—', ...this.vatCodes().map((v) => `${v.code} — ${v.name}`)]);

  protected readonly titleI18n = computed(() => ({ name: 'title', label: this.i18n().title_label(), placeholder: this.i18n().title_placeholder(), helper: this.i18n().title_helper() } as TextInputI18n));
  protected readonly accountI18n = computed(() => ({ name: 'accountKey', label: this.i18n().account_label(), helper: this.i18n().account_helper() } as AccountSelectI18n));
  protected readonly vatCodeI18n = computed(() => ({ name: 'vatCodeKey', label: this.i18n().vat_label(), helper: this.i18n().vat_helper() } as StringSelectI18n));

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
