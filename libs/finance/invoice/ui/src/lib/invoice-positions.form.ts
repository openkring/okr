import { Component, computed, effect, input, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { AccountModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import {
  INVOICE_POSITION_NAME_LENGTH, InvoiceI18n, InvoicePositionInput, invoicePositionsValidations, MAX_INVOICE_POSITIONS,
  newInvoicePosition, positionsTotal, revenueAccounts,
} from '@okr/finance-invoice-util';

type PositionField = 'name' | 'amount' | 'accountKey';

/**
 * The positions of a native invoice (spec 1.76): one row per position with name, amount in CHF and
 * revenue account (leaf accounts of the classes 3 and 4), a running total and "Position hinzufügen".
 * Valid when there is at least one position and each has a name, an amount above zero and an account.
 * Embedded as its own card in InvoiceEditForm; read-only unless the invoice is a draft.
 */
@Component({
  selector: 'okr-invoice-positions-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    ErrorNote, TextInput, NumberInput, AccountSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonItem, IonLabel, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .position { border-bottom: 1px solid var(--ion-color-light, #f4f5f8); }
    .total { font-weight: 600; }
  `],
  template: `
    @if (showForm()) {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().positions_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            @for (position of positions(); track $index; let i = $index) {
              <ion-row class="position">
                <ion-col size="12" size-md="5">
                  <okr-text-input [i18n]="nameI18n()" [value]="position.name"
                    (valueChange)="onPositionChange(i, 'name', $event)"
                    [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="rowErrors()[i]?.name ?? []" />
                </ion-col>
                <ion-col size="5" size-md="2">
                  <okr-number-input [i18n]="amountI18n()" [value]="position.amount"
                    (valueChange)="onAmountChange(i, $event)"
                    [min]="0" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="rowErrors()[i]?.amount ?? []" />
                </ion-col>
                <ion-col [size]="isReadOnly() ? 7 : 5" size-md="4">
                  <okr-account-select [i18n]="accountI18n()" [accounts]="selectableAccounts()"
                    [selectedKey]="position.accountKey"
                    (selectedKeyChange)="onPositionChange(i, 'accountKey', $event)"
                    [allowEmpty]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="rowErrors()[i]?.accountKey ?? []" />
                </ion-col>
                @if (!isReadOnly()) {
                  <ion-col size="2" size-md="1" class="ion-align-self-center ion-text-end">
                    <ion-button fill="clear" color="medium" (click)="removePosition(i)" [attr.aria-label]="i18n().positions_remove()">
                      <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                    </ion-button>
                  </ion-col>
                }
              </ion-row>
            }
            <ion-row>
              <ion-col size="12">
                <okr-error-note [errors]="listErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                @if (canAdd()) {
                  <ion-button fill="clear" (click)="addPosition()">
                    <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                    {{ i18n().positions_add() }}
                  </ion-button>
                  <!-- the parent (feature layer) opens the fee-schedule picker and writes the pick back -->
                  <ion-button fill="clear" (click)="feeSelect.emit()">
                    <ion-icon slot="start" src="{{ 'list' | svgIcon }}" />
                    {{ i18n().positions_fromFeeSchedule() }}
                  </ion-button>
                }
              </ion-col>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label class="total">{{ i18n().positions_total() }}</ion-label>
                  <ion-note slot="end" class="total">CHF {{ total() }}</ion-note>
                </ion-item>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class InvoicePositionsForm {
  /** kept in step with the cap the Vest suite enforces on a position's name */
  protected readonly nameLength = INVOICE_POSITION_NAME_LENGTH;

  // inputs
  public readonly i18n = input.required<InvoiceI18n>();
  public readonly positions = model.required<InvoicePositionInput[]>();
  /** the whole chart of accounts; only the revenue leaves are offered */
  public readonly accounts = input<AccountModel[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** «Aus Gebührenplan übernehmen» (spec 1.78) — the parent opens the picker */
  public readonly feeSelect = output<void>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly selectableAccounts = computed(() => revenueAccounts(this.accounts()));
  protected readonly total = computed(() => positionsTotal(this.positions()).toFixed(2));
  protected readonly canAdd = computed(() => !this.isReadOnly() && this.positions().length < MAX_INVOICE_POSITIONS);

  private readonly validationResult = computed(() => invoicePositionsValidations(this.positions()));
  protected readonly listErrors = computed(() => this.validationResult().getErrors('positions'));
  protected readonly rowErrors = computed(() => {
    const result = this.validationResult();
    return this.positions().map((_, i) => ({
      name: result.getErrors(`${i}.name`),
      amount: result.getErrors(`${i}.amount`),
      accountKey: result.getErrors(`${i}.accountKey`),
    }));
  });

  protected readonly nameI18n = computed(() => ({
    name: 'positionName', label: this.i18n().positions_name_label(), placeholder: this.i18n().positions_name_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly amountI18n = computed(() => ({
    name: 'positionAmount', label: this.i18n().positions_amount_label(), placeholder: this.i18n().positions_amount_placeholder(), helper: '',
  } as NumberInputI18n));
  protected readonly accountI18n = computed(() => ({
    name: 'positionAccount', label: this.i18n().positions_account_label(),
  } as AccountSelectI18n));

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  protected onPositionChange(index: number, field: PositionField, value: string): void {
    this.update(index, { [field]: value });
  }

  protected onAmountChange(index: number, value: number | string | null): void {
    const amount = Number(value);
    // two decimals: the server books Rappen
    this.update(index, { amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0 });
  }

  protected addPosition(): void {
    if (!this.canAdd()) return;
    this.dirty.emit(true);
    this.positions.update((list) => [...list, newInvoicePosition()]);
  }

  protected removePosition(index: number): void {
    if (this.isReadOnly()) return;
    this.dirty.emit(true);
    this.positions.update((list) => list.filter((_, i) => i !== index));
  }

  private update(index: number, patch: Partial<InvoicePositionInput>): void {
    if (this.isReadOnly()) return;
    this.dirty.emit(true);
    this.positions.update((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
}
