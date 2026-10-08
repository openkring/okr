import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { BudgetKind, BudgetVersionModel, RoleName, UserModel } from '@okr/shared-models';
import { ErrorNote, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { BUDGET_NAME_LENGTH, BudgetI18n, budgetVersionValidations } from '@okr/finance-budget-util';

export type { BudgetI18n };

const BUDGET_KINDS: BudgetKind[] = ['budget', 'forecast'];

/**
 * The budget-version form: name, kind, fiscal year, notes. When the version is a copy, the base
 * version's name is shown read-only. The fiscal year is locked (`fiscalYearLocked`) once the version
 * has lines. Presentational only — the opener persists what the modal dismisses with.
 */
@Component({
  selector: 'okr-budget-version-form',
  standalone: true,
  imports: [TextInput, StringSelect, NotesInput, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="kindI18n()" [selectedString]="kind()" (selectedStringChange)="onFieldChange('kind', $event)"
                    [stringList]="kinds" [labels]="kindLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="kindErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="fiscalYearI18n()" [selectedString]="fiscalYearText()" (selectedStringChange)="onFieldChange('fiscalYear', $event)"
                    [stringList]="yearList()" [readOnly]="isYearReadOnly()" />
                  <okr-error-note [errors]="fiscalYearErrors()" />
                </ion-col>
                @if (baseVersionName()) {
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none">
                      <ion-label>
                        <p>{{ i18n().baseVersion() }}</p>
                        <h3>{{ baseVersionName() }}</h3>
                      </ion-label>
                    </ion-item>
                  </ion-col>
                }
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
export class BudgetVersionForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly nameLength = BUDGET_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly kinds: string[] = BUDGET_KINDS;

  // inputs
  public readonly formData = model.required<BudgetVersionModel>();
  public readonly i18n = input.required<BudgetI18n>();
  /** the fiscal years on offer; the version's own year is always added */
  public readonly years = input<number[]>([]);
  /** true once the version has lines: the year can no longer change */
  public readonly fiscalYearLocked = input(false);
  /** name of the version this one is copied from; '' = not a copy */
  public readonly baseVersionName = input('');
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isYearReadOnly = computed(() => this.isReadOnly() || coerceBoolean(this.fiscalYearLocked()));

  protected readonly budgetForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, budgetVersionValidations as any));

  private readonly validationResult = vestErrors(this.budgetForm);
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected kindErrors = computed(() => this.validationResult().getErrors('kind'));
  protected fiscalYearErrors = computed(() => this.validationResult().getErrors('fiscalYear'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));

  protected name = computed(() => this.formData().name ?? '');
  protected kind = computed(() => this.formData().kind ?? 'budget');
  protected notes = computed(() => this.formData().notes ?? '');
  protected fiscalYearText = computed(() => String(this.formData().fiscalYear || ''));
  protected yearList = computed(() => {
    const _own = this.formData().fiscalYear;
    const _years = new Set(this.years());
    if (_own) _years.add(_own);
    return [..._years].sort((a, b) => a - b).map(String);
  });
  protected kindLabels = computed(() => [this.i18n().kind_budget(), this.i18n().kind_forecast()]);

  protected nameI18n = computed(() => ({
    name: 'name', label: this.i18n().name(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper()
  } as TextInputI18n));
  protected kindI18n = computed(() => ({ name: 'kind', label: this.i18n().kind() } as StringSelectI18n));
  protected fiscalYearI18n = computed(() => ({
    name: 'fiscalYear', label: this.i18n().fiscalYear(), helper: this.i18n().fiscalYear_helper()
  } as StringSelectI18n));
  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  constructor() {
    effect(() => this.valid.emit(this.budgetForm().valid()));
  }

  protected onFieldChange(fieldName: 'name' | 'kind' | 'fiscalYear' | 'notes', fieldValue: string): void {
    this.dirty.emit(true);
    const _value = fieldName === 'fiscalYear' ? Number(fieldValue) : fieldValue;
    this.formData.update((vm) => ({ ...vm, [fieldName]: _value }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
