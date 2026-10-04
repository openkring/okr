import { Component, computed, effect, input, model, output } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow,
  IonSegment, IonSegmentButton,
} from '@ionic/angular/standalone';

import { AccountModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, isRebatePosition } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { leafAccounts } from '@okr/finance-account-util';
import {
  applyDiscounts, INVOICE_POSITION_NAME_LENGTH, InvoiceI18n, InvoicePositionInput, invoicePositionsValidations,
  MAX_INVOICE_POSITIONS, moveItem, positionsTotal, subtotalAt,
} from '@okr/finance-invoice-util';

type PositionField = 'name' | 'accountKey';
type RowKind = 'money' | 'rebate' | 'text' | 'subtotal' | 'pageBreak';
type DiscountMode = NonNullable<InvoicePositionInput['discountMode']>;

/**
 * The positions of a native invoice (spec 1.76, kinds spec 1.84), one row per line in invoice order:
 * - money position: account (any leaf), name, amount in CHF;
 * - discount (Rabatt): account (optional — empty reduces the revenue above it), name, percent or CHF,
 *   the resulting amount; a percent discount is recomputed from the running total above it;
 * - text: a full-width line; subtotal: its label and the sum above it; page break: a divider.
 * Every row can be moved up/down and removed. The add button asks the parent for the menu of kinds.
 * Valid when there is at least one money position and every row is complete for its kind.
 * Embedded as its own card in InvoiceEditForm; read-only unless the invoice is a draft.
 */
@Component({
  selector: 'okr-invoice-positions-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    ErrorNote, TextInput, NumberInput, AccountSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonItem, IonLabel, IonNote,
    IonSegment, IonSegmentButton,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .position { border-bottom: 1px solid var(--ion-color-light, #f4f5f8); }
    .total { font-weight: 600; }
    .description { display: block; padding: 0 16px 8px; font-size: 0.8rem; }
    .actions { display: flex; justify-content: flex-end; align-items: center; }
    .actions ion-button { margin: 0; }
    .page-break { width: 100%; text-align: center; color: var(--ion-color-medium); border-top: 1px dashed var(--ion-color-medium); padding-top: 4px; font-size: 0.8rem; }
    .computed { font-weight: 600; }
    ion-segment { max-width: 140px; }
  `],
  template: `
    @if (showForm()) {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().positions_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            @for (position of positions(); track $index; let i = $index; let first = $first; let last = $last) {
              <ion-row class="position ion-align-items-center">
                @switch (kindOf(position)) {
                  @case ('money') {
                    <ion-col size="12" size-md="4">
                      <okr-account-select [i18n]="accountI18n()" [accounts]="selectableAccounts()"
                        [selectedKey]="position.accountKey"
                        (selectedKeyChange)="onPositionChange(i, 'accountKey', $event)"
                        [allowEmpty]="false" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="rowErrors()[i]?.accountKey ?? []" />
                    </ion-col>
                    <ion-col size="12" size-md="4">
                      <okr-text-input [i18n]="nameI18n()" [value]="position.name"
                        (valueChange)="onPositionChange(i, 'name', $event)"
                        [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="rowErrors()[i]?.name ?? []" />
                    </ion-col>
                    <ion-col size="12" size-md="2">
                      <okr-number-input [i18n]="amountI18n()" [value]="position.amount"
                        (valueChange)="onAmountChange(i, $event)"
                        [min]="0" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="rowErrors()[i]?.amount ?? []" />
                    </ion-col>
                  }
                  @case ('rebate') {
                    <ion-col size="12" size-md="3">
                      <okr-account-select [i18n]="discountAccountI18n()" [accounts]="selectableAccounts()"
                        [selectedKey]="position.accountKey"
                        (selectedKeyChange)="onPositionChange(i, 'accountKey', $event)"
                        [allowEmpty]="true" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="3">
                      <okr-text-input [i18n]="nameI18n()" [value]="position.name"
                        (valueChange)="onPositionChange(i, 'name', $event)"
                        [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="rowErrors()[i]?.name ?? []" />
                    </ion-col>
                    <ion-col size="5" size-md="2">
                      <ion-segment [value]="position.discountMode ?? 'percent'" [disabled]="isReadOnly()"
                        (ionChange)="onDiscountModeChange(i, $any($event).detail.value)">
                        <ion-segment-button value="percent"><ion-label>%</ion-label></ion-segment-button>
                        <ion-segment-button value="amount"><ion-label>CHF</ion-label></ion-segment-button>
                      </ion-segment>
                    </ion-col>
                    <ion-col size="7" size-md="2">
                      @if (position.discountMode === 'amount') {
                        <okr-number-input [i18n]="discountAmountI18n()" [value]="-position.amount"
                          (valueChange)="onDiscountAmountChange(i, $event)"
                          [min]="0" [readOnly]="isReadOnly()" />
                        <okr-error-note [errors]="rowErrors()[i]?.amount ?? []" />
                      } @else {
                        <okr-number-input [i18n]="discountPercentI18n()" [value]="position.discountPercent ?? 0"
                          (valueChange)="onDiscountPercentChange(i, $event)"
                          [min]="0" [max]="100" [readOnly]="isReadOnly()" />
                        <okr-error-note [errors]="rowErrors()[i]?.discountPercent ?? []" />
                        <ion-note class="computed">CHF {{ formatAmount(position.amount) }}</ion-note>
                      }
                    </ion-col>
                  }
                  @case ('text') {
                    <ion-col size="12" size-md="10">
                      <okr-text-input [i18n]="textI18n()" [value]="position.name"
                        (valueChange)="onPositionChange(i, 'name', $event)"
                        [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="rowErrors()[i]?.name ?? []" />
                    </ion-col>
                  }
                  @case ('subtotal') {
                    <ion-col size="8" size-md="8">
                      <okr-text-input [i18n]="nameI18n()" [value]="position.name"
                        (valueChange)="onPositionChange(i, 'name', $event)"
                        [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="4" size-md="2" class="ion-text-end">
                      <ion-note class="computed">CHF {{ subtotal(i) }}</ion-note>
                    </ion-col>
                  }
                  @case ('pageBreak') {
                    <ion-col size="12" size-md="10">
                      <div class="page-break">{{ i18n().positions_kind_pageBreak() }}</div>
                    </ion-col>
                  }
                }
                @if (!isReadOnly()) {
                  <ion-col size="12" size-md="2" class="actions">
                    <ion-button fill="clear" color="medium" [disabled]="first" (click)="move(i, -1)" [attr.aria-label]="i18n().positions_moveUp()">
                      <ion-icon slot="icon-only" src="{{ 'arrow-up' | svgIcon }}" />
                    </ion-button>
                    <ion-button fill="clear" color="medium" [disabled]="last" (click)="move(i, 1)" [attr.aria-label]="i18n().positions_moveDown()">
                      <ion-icon slot="icon-only" src="{{ 'arrow-down' | svgIcon }}" />
                    </ion-button>
                    <ion-button fill="clear" color="medium" (click)="removePosition(i)" [attr.aria-label]="i18n().positions_remove()">
                      <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                    </ion-button>
                  </ion-col>
                }
                @if (position.description) {
                  <ion-col size="12">
                    <ion-note class="description">{{ position.description }}</ion-note>
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
                  <!-- the parent (feature layer) offers the kinds of position and writes the new one back -->
                  <ion-button fill="clear" (click)="positionAdd.emit()" [attr.aria-label]="i18n().positions_add()">
                    <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
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
  /** the whole chart of accounts; every leaf account is offered (posting needs a leaf) */
  public readonly accounts = input<AccountModel[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** «Position hinzufügen» — the parent opens the menu of position kinds (Standard, Gebühren, …) */
  public readonly positionAdd = output<void>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly selectableAccounts = computed(() => leafAccounts(this.accounts()));
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
      discountPercent: result.getErrors(`${i}.discountPercent`),
    }));
  });

  protected readonly nameI18n = computed(() => ({
    name: 'positionName', label: this.i18n().positions_name_label(), placeholder: this.i18n().positions_name_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly textI18n = computed(() => ({
    name: 'positionText', label: this.i18n().positions_text_label(), placeholder: this.i18n().positions_text_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly amountI18n = computed(() => ({
    name: 'positionAmount', label: this.i18n().positions_amount_label(), placeholder: this.i18n().positions_amount_placeholder(), helper: '',
  } as NumberInputI18n));
  protected readonly discountAmountI18n = computed(() => ({
    name: 'discountAmount', label: this.i18n().positions_discount_amount_label(), placeholder: '0.00', helper: '',
  } as NumberInputI18n));
  protected readonly discountPercentI18n = computed(() => ({
    name: 'discountPercent', label: this.i18n().positions_discount_percent_label(), placeholder: '0', helper: '',
  } as NumberInputI18n));
  protected readonly accountI18n = computed(() => ({
    name: 'positionAccount', label: this.i18n().positions_account_label(),
  } as AccountSelectI18n));
  protected readonly discountAccountI18n = computed(() => ({
    name: 'discountAccount', label: this.i18n().positions_discount_account_label(),
  } as AccountSelectI18n));

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  protected kindOf(p: InvoicePositionInput): RowKind {
    if (p.type === 'text' || p.type === 'subtotal' || p.type === 'pageBreak') return p.type;
    return isRebatePosition(p) ? 'rebate' : 'money';
  }

  protected subtotal(index: number): string {
    return subtotalAt(this.positions(), index).toFixed(2);
  }

  protected formatAmount(amount: number): string {
    return (Number.isFinite(amount) ? amount : 0).toFixed(2);
  }

  protected onPositionChange(index: number, field: PositionField, value: string): void {
    this.update(index, { [field]: value });
  }

  protected onAmountChange(index: number, value: number | string | null): void {
    this.update(index, { amount: toChf(value) });
  }

  protected onDiscountModeChange(index: number, mode: DiscountMode): void {
    // a fixed amount keeps the last computed value; percent mode recomputes it from the rate
    this.update(index, mode === 'amount' ? { discountMode: 'amount', discountPercent: 0 } : { discountMode: 'percent' });
  }

  protected onDiscountAmountChange(index: number, value: number | string | null): void {
    this.update(index, { amount: -Math.abs(toChf(value)) || 0 });
  }

  protected onDiscountPercentChange(index: number, value: number | string | null): void {
    const percent = Number(value);
    this.update(index, { discountPercent: Number.isFinite(percent) ? Math.round(percent * 100) / 100 : 0 });
  }

  protected move(index: number, direction: -1 | 1): void {
    if (this.isReadOnly()) return;
    this.dirty.emit(true);
    this.positions.update((list) => applyDiscounts(moveItem(list, index, direction)));
  }

  protected removePosition(index: number): void {
    if (this.isReadOnly()) return;
    this.dirty.emit(true);
    this.positions.update((list) => applyDiscounts(list.filter((_, i) => i !== index)));
  }

  /** every change re-runs the percent discounts: a position above one may have changed (spec 1.84 K5) */
  private update(index: number, patch: Partial<InvoicePositionInput>): void {
    if (this.isReadOnly()) return;
    this.dirty.emit(true);
    this.positions.update((list) => applyDiscounts(list.map((p, i) => (i === index ? { ...p, ...patch } : p))));
  }
}

/** a CHF input value with two decimals: the server books Rappen */
function toChf(value: number | string | null): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}
