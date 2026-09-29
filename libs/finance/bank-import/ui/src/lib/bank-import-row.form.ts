import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';

import { AccountModel, BankImportRowModel, BankImportSplit, VatCodeModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AmountInput, AmountInputI18n, ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { BANK_IMPORT_TITLE_LENGTH, BankImportI18n, bankImportRowValidations, emptyBankImportSplit, mainPartAmount } from '@okr/finance-bank-import-util';

/**
 * The one-off assignment form for a single staging row (spec 1.60 §5.2). Date/payee/rawText/
 * amount are the bank's own data — shown read-only, never editable — only title, the
 * counter-account and the VAT code are form inputs. No notes/chips: a staging row is not a
 * record worth annotating.
 *
 * Split assignment: further parts (own Buchungstext, account, VAT, amount) can be added below.
 * The main part above has no amount field — it takes the rest, so the parts always add up to the
 * bank amount and the treasurer never has to balance anything by hand.
 */
@Component({
  selector: 'okr-bank-import-row-form',
  standalone: true,
  imports: [TextInput, StringSelect, AccountSelect, AmountInput, ErrorNote, SvgIconPipe, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonNote, IonButton, IonIcon, DecimalPipe],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .part { border-top: 1px solid var(--ion-color-light-shade); }
    .part-tools { display: flex; justify-content: flex-end; }
    .rest { text-align: end; font-weight: 600; padding: 0.5rem 1rem; }
  `],
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
                    [autofocus]="true" [maxLength]="titleLength" [readOnly]="isReadOnly()" />
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

        @if (splits().length > 0 || !isReadOnly()) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ i18n().split_heading() }}</h3>
                  <ion-note>{{ i18n().split_intro() }}</ion-note>
                </ion-label>
              </ion-item>
              <ion-grid>
                @for (part of splits(); track $index; let i = $index) {
                  <ion-row class="part ion-align-items-center">
                    <ion-col size="12" size-md="6">
                      <okr-text-input [i18n]="titleI18n()" [value]="part.title" (valueChange)="onSplitChange(i, 'title', $event)"
                        [maxLength]="titleLength" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <okr-account-select [i18n]="splitAccountI18n()" [accounts]="accounts()" [allowEmpty]="false" [compact]="true"
                        [selectedKey]="part.accountKey" (selectedKeyChange)="onSplitChange(i, 'accountKey', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="5">
                      <okr-string-select [i18n]="vatCodeI18n()" [stringList]="vatCodeKeys()" [labels]="vatCodeLabels()"
                        [selectedString]="part.vatCodeKey" (selectedStringChange)="onSplitChange(i, 'vatCodeKey', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="9" size-md="5">
                      <okr-amount-input [i18n]="splitAmountI18n()" [value]="part.amount" (valueChange)="onSplitChange(i, 'amount', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="3" size-md="2">
                      @if (!isReadOnly()) {
                        <div class="part-tools">
                          <ion-button fill="clear" size="small" color="danger" (click)="removeSplit(i)" [title]="i18n().split_remove()">
                            <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                          </ion-button>
                        </div>
                      }
                    </ion-col>
                  </ion-row>
                }
                <ion-row class="ion-align-items-center">
                  <ion-col size="6">
                    @if (!isReadOnly()) {
                      <ion-button fill="clear" size="small" (click)="addSplit()">
                        <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />{{ i18n().split_add() }}
                      </ion-button>
                    }
                  </ion-col>
                  @if (splits().length > 0) {
                    <ion-col size="6" class="rest">{{ i18n().split_rest() }}: {{ rest() / 100 | number:'1.2-2' }}</ion-col>
                  }
                </ion-row>
              </ion-grid>
              <okr-error-note [errors]="splitsErrors()" />
            </ion-card-content>
          </ion-card>
        }
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
  protected readonly splitsErrors = computed(() => this.bankImportRowForm.splits().errors().map(e => e.message ?? ''));

  /** kept in step with the cap the Vest suite enforces on every Buchungstext */
  protected readonly titleLength = BANK_IMPORT_TITLE_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly dateLabel = computed(() => convertDateFormatToString(this.formData()?.date, DateFormat.StoreDate, DateFormat.ViewDate, false));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly accountKey = computed(() => this.formData()?.accountKey ?? '');
  protected readonly vatCodeKey = computed(() => this.formData()?.vatCodeKey ?? '');
  protected readonly splits = computed(() => this.formData()?.splits ?? []);
  protected readonly rest = computed(() => mainPartAmount(this.formData()));

  protected readonly vatCodeKeys = computed(() => ['', ...this.vatCodes().map((v) => v.okey)]);
  protected readonly vatCodeLabels = computed(() => ['—', ...this.vatCodes().map((v) => `${v.code} — ${v.name}`)]);

  protected readonly titleI18n = computed(() => ({ name: 'title', label: this.i18n().title_label(), placeholder: this.i18n().title_placeholder(), helper: this.i18n().title_helper() } as TextInputI18n));
  protected readonly accountI18n = computed(() => ({ name: 'accountKey', label: this.i18n().account_label(), helper: this.i18n().account_helper() } as AccountSelectI18n));
  protected readonly splitAccountI18n = computed(() => ({ name: 'splitAccountKey', label: this.i18n().account_label(), helper: '' } as AccountSelectI18n));
  protected readonly splitAmountI18n = computed(() => ({ name: 'splitAmount', label: this.i18n().split_amount() } as AmountInputI18n));
  protected readonly vatCodeI18n = computed(() => ({ name: 'vatCodeKey', label: this.i18n().vat_label(), helper: this.i18n().vat_helper() } as StringSelectI18n));

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onSplitChange(index: number, field: keyof BankImportSplit, value: string | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, splits: (vm.splits ?? []).map((p, i) => i === index ? { ...p, [field]: value } : p) }));
  }

  protected addSplit(): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, splits: [...(vm.splits ?? []), emptyBankImportSplit()] }));
  }

  protected removeSplit(index: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, splits: (vm.splits ?? []).filter((_, i) => i !== index) }));
  }
}
