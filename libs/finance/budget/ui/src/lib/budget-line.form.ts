import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { AccountModel, BudgetLineModel, CostCenterModel, MoneyModel, RoleName, UserModel } from '@okr/shared-models';
import { AmountInput, AmountInputI18n, ErrorNote, NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { BudgetI18n, BudgetLineFormModel, budgetLineValidations, isBudgetableAccount } from '@okr/finance-budget-util';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { leafCostCenters } from '@okr/finance-cost-center-util';

/**
 * One budget cell: leaf Kostenstelle x budgetable P&L account x amount. The amount is typed in
 * francs and held in Rappen (`MoneyModel.amount`, minor units) — the AmountInput does the conversion.
 */
@Component({
  selector: 'okr-budget-line-form',
  standalone: true,
  imports: [CostCenterSelect, AccountSelect, AmountInput, NotesInput, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [allowEmpty]="false"
                    [selectedKey]="costCenterKey()" (selectedKeyChange)="onFieldChange('costCenterKey', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="costCenterKeyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="accountI18n()" [accounts]="budgetableAccounts()" [leavesOnly]="false" [allowEmpty]="false"
                    [selectedKey]="accountKey()" (selectedKeyChange)="onFieldChange('accountKey', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="accountKeyErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-amount-input [i18n]="amountI18n()" [value]="amountMinor()" (valueChange)="onAmountChange($event)" [readOnly]="isReadOnly()" />
                  <ion-note>{{ i18n().amount_helper() }}</ion-note>
                  <okr-error-note [errors]="amountErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if (hasRole('treasurer')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
            [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="notesErrors()" />
        }
      </form>
    }
  `
})
export class BudgetLineForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  // inputs
  public readonly formData = model.required<BudgetLineModel>();
  public readonly i18n = input.required<BudgetI18n>();
  /** every cost centre of the accounting tenant (archived included) */
  public readonly costCenters = input<CostCenterModel[]>([]);
  /** every account of the accounting tenant; the form offers the budgetable ones */
  public readonly accounts = input<AccountModel[]>([]);
  /** all lines of the same version (a cell must stay unique) */
  public readonly existingLines = input<BudgetLineModel[]>([]);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly budgetableAccounts = computed(() =>
    this.accounts().filter(a => isBudgetableAccount(a, this.accounts())));
  private readonly leafKeys = computed(() => new Set(leafCostCenters(this.costCenters()).map(c => c.okey)));
  private readonly budgetableKeys = computed(() => new Set(this.budgetableAccounts().map(a => a.okey)));

  // The suite needs the other lines and the allowed keys, which validateVestTree does not pass, and
  // an amount in a plain number: the bridge calls it through a closure that adds and maps them.
  private readonly suiteWithContext = (model: BudgetLineModel) => {
    const _flat: BudgetLineFormModel = {
      okey: model.okey, costCenterKey: model.costCenterKey, accountKey: model.accountKey,
      amount: model.amount?.amount ?? 0, notes: model.notes
    };
    return budgetLineValidations(_flat, this.existingLines(), this.leafKeys(), this.budgetableKeys());
  };
  protected readonly lineForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  private readonly validationResult = vestErrors(this.lineForm);
  protected costCenterKeyErrors = computed(() => this.validationResult().getErrors('costCenterKey'));
  protected accountKeyErrors = computed(() => this.validationResult().getErrors('accountKey'));
  protected amountErrors = computed(() => this.validationResult().getErrors('amount'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));

  protected costCenterKey = computed(() => this.formData().costCenterKey ?? '');
  protected accountKey = computed(() => this.formData().accountKey ?? '');
  protected amountMinor = computed(() => this.formData().amount?.amount ?? 0);
  protected notes = computed(() => this.formData().notes ?? '');

  protected costCenterI18n = computed(() => ({
    name: 'costCenterKey', label: this.i18n().costCenterKey(), helper: this.i18n().costCenterKey_helper()
  } as CostCenterSelectI18n));
  protected accountI18n = computed(() => ({
    name: 'accountKey', label: this.i18n().accountKey(), helper: this.i18n().accountKey_helper()
  } as AccountSelectI18n));
  protected amountI18n = computed(() => ({ name: 'amount', label: this.i18n().amount() } as AmountInputI18n));
  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  constructor() {
    effect(() => this.valid.emit(this.lineForm().valid()));
  }

  protected onFieldChange(fieldName: 'costCenterKey' | 'accountKey' | 'notes', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onAmountChange(minor: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm, amount: new MoneyModel(minor, vm.amount?.currency, vm.amount?.periodicity)
    }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
