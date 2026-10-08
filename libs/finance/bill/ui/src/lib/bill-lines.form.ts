import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonLabel, IonRow } from '@ionic/angular/standalone';

import { AccountModel, BillLine, CostCenterModel, ProjectModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, formatMinorAmount, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { ProjectSelect } from '@okr/project-project-ui';
import { leafAccounts } from '@okr/finance-account-util';
import { BILL_LINE_TITLE_LENGTH, BillI18n, billLinesTotal, billLineDetailsValidations, billLinesValidations, lineCostCenterFallback, MAX_BILL_LINES, newBillLine, showLineCostCenter, showLineProject, withLineAccount } from '@okr/finance-bill-util';

/**
 * The lines of a native bill (spec 1.85 Q2), one row each: account (any leaf), text, amount in CHF,
 * remove. «Zeile hinzufügen» appends a line on the books' default expense account. The total is the
 * sum of the lines. Valid when there is at least one line and every line has an account and an amount
 * above 0. On P&L lines a Kostenstelle and a Kostenträger can be picked (spec 1.92). Embedded as its own card in BillEditForm; read-only unless the bill is a draft.
 */
@Component({
  selector: 'okr-bill-lines-form',
  standalone: true,
  imports: [
    SvgIconPipe, ErrorNote, TextInput, NumberInput, AccountSelect, CostCenterSelect, ProjectSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonLabel,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .line { border-bottom: 1px solid var(--ion-color-light, #f4f5f8); }
    .total { font-weight: 600; }
  `],
  template: `
    @if (showForm() && !noLinesToEdit()) {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().lines_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            @for (line of lines(); track $index; let i = $index) {
              <ion-row class="line ion-align-items-center">
                <ion-col size="12" size-md="4">
                  <okr-account-select [i18n]="accountI18n()" [accounts]="selectableAccounts()" [selectedKey]="line.accountKey"
                    (selectedKeyChange)="onLineChange(i, 'accountKey', $event)" [allowEmpty]="false" [readOnly]="structureLocked()" />
                  <okr-error-note [errors]="errorsOf(i, 'accountKey')" />
                </ion-col>
                <ion-col size="12" size-md="4">
                  <okr-text-input [i18n]="titleI18n()" [value]="line.title" (valueChange)="onLineChange(i, 'title', $event)"
                    [maxLength]="titleLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errorsOf(i, 'title')" />
                </ion-col>
                <ion-col size="10" size-md="3">
                  <okr-number-input [i18n]="amountI18n()" [value]="line.amount / 100" (valueChange)="onAmountChange(i, $event)"
                    [min]="0" [readOnly]="structureLocked()" />
                  <okr-error-note [errors]="errorsOf(i, 'amount')" />
                </ion-col>
                <ion-col size="2" size-md="1">
                  @if (!structureLocked()) {
                    <ion-button fill="clear" [title]="i18n().line_remove()" (click)="removeLine(i)">
                      <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                    </ion-button>
                  }
                </ion-col>
              </ion-row>
              @if (showCostCenter(line) || showProject(line)) {
                <ion-row class="line ion-align-items-center">
                  <ion-col size="12" size-md="6">
                    @if (showCostCenter(line)) {
                      <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()"
                        [emptyIsFallback]="hasCostCenterFallback(line)"
                        [selectedKey]="line.costCenterKey" (selectedKeyChange)="onLineChange(i, 'costCenterKey', $event)" [readOnly]="isReadOnly()" />
                    }
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    @if (showProject(line)) {
                      <okr-project-select [projects]="projects()" [label]="i18n().line_project_label()"
                        [selectedKey]="line.projectKey" (selectedKeyChange)="onLineChange(i, 'projectKey', $event)" [readOnly]="isReadOnly()" />
                    }
                  </ion-col>
                </ion-row>
              }
            }
            <okr-error-note [errors]="listErrors()" />
            <ion-row class="ion-align-items-center">
              <ion-col size="6">
                @if (!structureLocked() && lines().length < maxLines) {
                  <ion-button fill="clear" (click)="addLine()">
                    <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />
                    {{ i18n().line_add() }}
                  </ion-button>
                }
              </ion-col>
              <ion-col size="6" class="ion-text-end">
                <ion-label class="total">{{ i18n().total_label() }} CHF {{ total() }}</ion-label>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    }
  `
})
export class BillLinesForm {
  /** kept in step with the cap the Vest suite enforces on a line title */
  protected readonly titleLength = BILL_LINE_TITLE_LENGTH;
  protected readonly maxLines = MAX_BILL_LINES;

  // inputs
  public readonly i18n = input.required<BillI18n>();
  public readonly lines = model.required<BillLine[]>();
  /** the chart of accounts of the bill's books; only leaves are offered */
  public readonly accounts = input<AccountModel[]>([]);
  /** the account a new line starts on (the books' default expense account) */
  public readonly defaultAccountKey = input('');
  /** the Kostenstellen of the app tenant (spec 1.65) — the picker is offered on P&L lines when `costCentersEnabled` */
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly costCentersEnabled = input(false);
  /** `AccountingConfig.defaultCostCenterKey` — fills a P&L line whose account has no default; '' = none */
  public readonly bookDefaultCostCenterKey = input('');
  /** all projects incl. archived — the Kostenträger picker is shown when there is at least one active one (spec 3.14) */
  public readonly projects = input<ProjectModel[]>([]);
  public readonly readOnly = input(true);
  /**
   * 'details' = a booked or paid bill (spec 1.92): only the line text, Kostenstelle and Kostenträger can change;
   * account, amount and the number of lines stay as booked.
   */
  public readonly mode = input<'draft' | 'details'>('draft');
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // The suite validates the line list (not a formData object) and takes only (lines, field?),
  // so the signal form wraps the writable `lines` model and the bridge gets the suite directly.
  protected readonly linesForm = form(this.lines, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, ((lines: BillLine[]) => this.mode() === 'details' ? billLineDetailsValidations(lines) : billLinesValidations(lines)) as any));

  private readonly validationResult = vestErrors(this.linesForm);
  protected readonly listErrors = computed(() => this.validationResult().getErrors('lines'));

  constructor() {
    // a bill migrated from bexio has no lines to edit: nothing to validate
    effect(() => this.valid.emit(this.linesForm().valid() || this.noLinesToEdit()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /** account, amount and add/remove: draft only */
  protected readonly structureLocked = computed(() => this.isReadOnly() || this.mode() === 'details');
  protected readonly noLinesToEdit = computed(() => this.mode() === 'details' && this.lines().length === 0);
  protected readonly selectableAccounts = computed(() => leafAccounts(this.accounts()));
  protected readonly total = computed(() => formatMinorAmount(billLinesTotal(this.lines())));

  protected readonly accountI18n = computed(() => ({
    name: 'lineAccount', label: this.i18n().line_account_label(), helper: this.i18n().line_account_helper(),
  } as AccountSelectI18n));
  protected readonly titleI18n = computed(() => ({
    name: 'lineTitle', label: this.i18n().line_title_label(), placeholder: this.i18n().line_title_placeholder(), helper: this.i18n().line_title_helper(),
  } as TextInputI18n));
  protected readonly amountI18n = computed(() => ({
    name: 'lineAmount', label: this.i18n().line_amount_label(), placeholder: this.i18n().line_amount_placeholder(), helper: this.i18n().line_amount_helper(),
  } as NumberInputI18n));

  protected readonly costCenterI18n = computed(() => ({ name: 'lineCostCenter', label: this.i18n().line_cost_center_label() } as CostCenterSelectI18n));

  protected showCostCenter(line: BillLine): boolean { return showLineCostCenter(line, this.accounts(), this.costCentersEnabled()); }
  protected showProject(line: BillLine): boolean { return showLineProject(line, this.accounts(), this.projects()); }
  protected hasCostCenterFallback(line: BillLine): boolean {
    return !!lineCostCenterFallback(line, this.accounts(), this.costCenters(), this.bookDefaultCostCenterKey());
  }

  protected errorsOf(i: number, field: 'accountKey' | 'amount' | 'title'): string[] {
    return this.validationResult().getErrors(`lines[${i}].${field}`);
  }

  protected onLineChange(i: number, field: 'accountKey' | 'title' | 'costCenterKey' | 'projectKey', value: string): void {
    this.dirty.emit(true);
    this.lines.update((lines) => lines.map((l, j) => {
      if (j !== i) return l;
      return field === 'accountKey' ? withLineAccount(l, value, this.accounts()) : { ...l, [field]: value };
    }));
  }

  /** CHF from the input → Rappen in the model, converted here once */
  protected onAmountChange(i: number, chf: number | string | null): void {
    const value = Number(chf);
    const amount = Number.isFinite(value) ? Math.round(value * 100) : 0;
    this.dirty.emit(true);
    this.lines.update((lines) => lines.map((l, j) => (j === i ? { ...l, amount } : l)));
  }

  protected addLine(): void {
    this.dirty.emit(true);
    this.lines.update((lines) => [...lines, newBillLine(this.defaultAccountKey())]);
  }

  protected removeLine(i: number): void {
    this.dirty.emit(true);
    this.lines.update((lines) => lines.filter((_, j) => j !== i));
  }
}
