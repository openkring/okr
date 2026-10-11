import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { CostAllocationModel, CostAllocationScope, CostCenterModel, MoneyModel, ProjectModel, RoleName, UserModel } from '@okr/shared-models';
import {
  AmountInput, AmountInputI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n
} from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { ALLOCATION_TITLE_LENGTH, BudgetI18n, CostAllocationFormModel, costAllocationValidations } from '@okr/finance-budget-util';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { ProjectSelect } from '@okr/project-project-ui';
import { leafCostCenters } from '@okr/finance-cost-center-util';

/**
 * One Umlage (spec 1.65 D24): title, Aufwand or Ertrag, from → to Kostenstelle, and a percentage of the source or a
 * fixed amount. The fiscal year is the list's, shown read-only. The amount is typed in francs, held in Rappen.
 */
@Component({
  selector: 'okr-cost-allocation-form',
  standalone: true,
  imports: [TextInput, StringSelect, CostCenterSelect, ProjectSelect, NumberInput, AmountInput, NotesInput, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="titleLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="sideI18n()" [stringList]="sides" [labels]="sideLabels()"
                    [selectedString]="side()" (selectedStringChange)="onFieldChange('side', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="sideErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-string-select [i18n]="scopeI18n()" [stringList]="scopes" [labels]="scopeLabels()"
                    [selectedString]="scope()" (selectedStringChange)="onScopeChange($event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="scopeErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  @if (scope() === 'project') {
                    <okr-project-select [projects]="projects()" [label]="i18n().alloc_fromProject()"
                      [selectedKey]="fromProjectKey()" (selectedKeyChange)="onFieldChange('fromProjectKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="fromProjectErrors()" />
                  } @else {
                    <okr-cost-center-select [i18n]="fromI18n()" [costCenters]="costCenters()" [allowEmpty]="false"
                      [selectedKey]="fromKey()" (selectedKeyChange)="onFieldChange('fromCostCenterKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="fromErrors()" />
                  }
                </ion-col>
                <ion-col size="12" size-md="6">
                  @if (scope() === 'center') {
                    <okr-cost-center-select [i18n]="toI18n()" [costCenters]="costCenters()" [allowEmpty]="false"
                      [selectedKey]="toKey()" (selectedKeyChange)="onFieldChange('toCostCenterKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="toErrors()" />
                  } @else {
                    <okr-project-select [projects]="projects()" [label]="i18n().alloc_toProject()"
                      [selectedKey]="toProjectKey()" (selectedKeyChange)="onFieldChange('toProjectKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="toProjectErrors()" />
                  }
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="modeI18n()" [stringList]="modes" [labels]="modeLabels()"
                    [selectedString]="mode()" (selectedStringChange)="onFieldChange('mode', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="modeErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  @if (mode() === 'percent') {
                    <okr-number-input [i18n]="percentI18n()" [value]="percent()" (valueChange)="onPercentChange($event)"
                      [min]="0" [max]="100" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="percentErrors()" />
                  } @else {
                    <okr-amount-input [i18n]="amountI18n()" [value]="amountMinor()" (valueChange)="onAmountChange($event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="amountErrors()" />
                  }
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
export class CostAllocationForm {
  /** kept in step with the caps the Vest suite enforces */
  protected readonly titleLength = ALLOCATION_TITLE_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly sides = ['expense', 'revenue'];
  protected readonly modes = ['percent', 'amount'];
  protected readonly scopes: CostAllocationScope[] = ['center', 'centerToProject', 'project'];

  public readonly formData = model.required<CostAllocationModel>();
  public readonly i18n = input.required<BudgetI18n>();
  /** every Kostenstelle of the books; the selects offer the live leaves */
  public readonly costCenters = input<CostCenterModel[]>([]);
  /** the projects of the tenant (D26) */
  public readonly projects = input<ProjectModel[]>([]);
  /** the list's fiscal year — restored when the scope leaves Projekt → Projekt (whole life, year 0) */
  public readonly defaultFiscalYear = input(0);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  private readonly leafKeys = computed(() => new Set(leafCostCenters(this.costCenters()).map(c => c.okey)));
  private readonly projectKeys = computed(() => new Set(this.projects().map(p => p.okey)));

  // The suite needs the allowed keys and a flat amount: the bridge calls it through a closure that adds them.
  private readonly suiteWithContext = (m: CostAllocationModel) => {
    const flat: CostAllocationFormModel = {
      title: m.title, fiscalYear: m.fiscalYear, scope: m.scope ?? 'center', side: m.side,
      fromCostCenterKey: m.fromCostCenterKey, toCostCenterKey: m.toCostCenterKey, fromProjectKey: m.fromProjectKey ?? '', toProjectKey: m.toProjectKey ?? '',
      mode: m.mode, amount: m.amount?.amount ?? 0, percent: m.percent ?? 0, notes: m.notes,
    };
    return costAllocationValidations(flat, this.leafKeys(), this.projectKeys());
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly allocationForm = form(this.formData, (path) => validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.allocationForm);
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected sideErrors = computed(() => this.validationResult().getErrors('side'));
  protected fromErrors = computed(() => this.validationResult().getErrors('fromCostCenterKey'));
  protected toErrors = computed(() => this.validationResult().getErrors('toCostCenterKey'));
  protected scopeErrors = computed(() => this.validationResult().getErrors('scope'));
  protected fromProjectErrors = computed(() => this.validationResult().getErrors('fromProjectKey'));
  protected toProjectErrors = computed(() => this.validationResult().getErrors('toProjectKey'));
  protected modeErrors = computed(() => this.validationResult().getErrors('mode'));
  protected percentErrors = computed(() => this.validationResult().getErrors('percent'));
  protected amountErrors = computed(() => this.validationResult().getErrors('amount'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));

  protected title = computed(() => this.formData().title ?? '');
  protected side = computed(() => this.formData().side ?? 'expense');
  protected fromKey = computed(() => this.formData().fromCostCenterKey ?? '');
  protected toKey = computed(() => this.formData().toCostCenterKey ?? '');
  protected mode = computed(() => this.formData().mode ?? 'percent');
  protected scope = computed((): CostAllocationScope => this.formData().scope ?? 'center');
  protected fromProjectKey = computed(() => this.formData().fromProjectKey ?? '');
  protected toProjectKey = computed(() => this.formData().toProjectKey ?? '');
  protected scopeI18n = computed(() => ({ name: 'scope', label: this.i18n().alloc_scope(), helper: '' } as StringSelectI18n));
  protected scopeLabels = computed(() => [this.i18n().alloc_scope_center(), this.i18n().alloc_scope_centerToProject(), this.i18n().alloc_scope_project()]);
  protected percent = computed(() => this.formData().percent ?? 0);
  protected amountMinor = computed(() => this.formData().amount?.amount ?? 0);
  protected notes = computed(() => this.formData().notes ?? '');

  protected titleI18n = computed(() => ({ name: 'title', label: this.i18n().alloc_title(), placeholder: this.i18n().alloc_title_placeholder(), helper: this.i18n().alloc_title_helper() } as TextInputI18n));
  protected sideI18n = computed(() => ({ name: 'side', label: this.i18n().alloc_side(), helper: '' } as StringSelectI18n));
  protected sideLabels = computed(() => [this.i18n().alloc_side_expense(), this.i18n().alloc_side_revenue()]);
  protected fromI18n = computed(() => ({ name: 'fromCostCenterKey', label: this.i18n().alloc_from(), helper: this.i18n().alloc_from_helper() } as CostCenterSelectI18n));
  protected toI18n = computed(() => ({ name: 'toCostCenterKey', label: this.i18n().alloc_to(), helper: this.i18n().alloc_to_helper() } as CostCenterSelectI18n));
  protected modeI18n = computed(() => ({ name: 'mode', label: this.i18n().alloc_mode(), helper: '' } as StringSelectI18n));
  protected modeLabels = computed(() => [this.i18n().alloc_mode_percent(), this.i18n().alloc_mode_amount()]);
  protected percentI18n = computed(() => ({ name: 'percent', label: this.i18n().alloc_percent(), helper: this.i18n().alloc_percent_helper() } as NumberInputI18n));
  protected amountI18n = computed(() => ({ name: 'amount', label: this.i18n().alloc_amount() } as AmountInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));

  constructor() {
    effect(() => this.valid.emit(this.allocationForm().valid()));
  }

  /** a scope change clears the ends that no longer apply; Projekt → Projekt runs over the whole life (year 0) */
  protected onScopeChange(value: string): void {
    const scope = (value as CostAllocationScope) || 'center';
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm, scope,
      fromCostCenterKey: scope === 'project' ? '' : vm.fromCostCenterKey,
      toCostCenterKey: scope === 'center' ? vm.toCostCenterKey : '',
      fromProjectKey: scope === 'project' ? vm.fromProjectKey : '',
      toProjectKey: scope === 'center' ? '' : vm.toProjectKey,
      fiscalYear: scope === 'project' ? 0 : (vm.fiscalYear || this.defaultFiscalYear()),
    }));
  }

  protected onFieldChange(fieldName: 'title' | 'side' | 'fromCostCenterKey' | 'toCostCenterKey' | 'fromProjectKey' | 'toProjectKey' | 'mode' | 'notes', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onPercentChange(value: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, percent: Number(value) || 0 }));
  }

  protected onAmountChange(minor: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, amount: new MoneyModel(minor, vm.amount?.currency, vm.amount?.periodicity) }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
