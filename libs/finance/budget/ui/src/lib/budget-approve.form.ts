import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { ErrorNote, DateInput, DateInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { BUDGET_APPROVAL_REF_LENGTH, BudgetApprovalFormModel, BudgetI18n, budgetApprovalValidations } from '@okr/finance-budget-util';

const APPROVAL_BODIES = ['gv', 'board'];

/** The approval form: when, by whom (GV or board) and the reference (minutes). Presentational only. */
@Component({
  selector: 'okr-budget-approve-form',
  standalone: true,
  imports: [DateInput, StringSelect, TextInput, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="approvedAtI18n()" [storeDate]="approvedAt()" (storeDateChange)="onFieldChange('approvedAt', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="approvedAtErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="approvedByI18n()" [selectedString]="approvedBy()" (selectedStringChange)="onFieldChange('approvedBy', $event)"
                    [stringList]="bodies" [labels]="bodyLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="approvedByErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="approvalRefI18n()" [value]="approvalRef()" (valueChange)="onFieldChange('approvalRef', $event)"
                    [maxLength]="refLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="approvalRefErrors()" />
                </ion-col>
              </ion-row>
              @if (supersededNote()) {
                <ion-row>
                  <ion-col size="12">
                    <ion-note style="white-space: pre-line">{{ supersededNote() }}</ion-note>
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class BudgetApproveForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly refLength = BUDGET_APPROVAL_REF_LENGTH;
  protected readonly bodies = APPROVAL_BODIES;

  // inputs
  public readonly formData = model.required<BudgetApprovalFormModel>();
  public readonly i18n = input.required<BudgetI18n>();
  /** which version is superseded by this approval (already worded); '' = none */
  public readonly supersededNote = input('');
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly approveForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, budgetApprovalValidations as any));

  private readonly validationResult = vestErrors(this.approveForm);
  protected approvedAtErrors = computed(() => this.validationResult().getErrors('approvedAt'));
  protected approvedByErrors = computed(() => this.validationResult().getErrors('approvedBy'));
  protected approvalRefErrors = computed(() => this.validationResult().getErrors('approvalRef'));

  protected approvedAt = computed(() => this.formData().approvedAt ?? '');
  protected approvedBy = computed(() => this.formData().approvedBy ?? '');
  protected approvalRef = computed(() => this.formData().approvalRef ?? '');
  protected bodyLabels = computed(() => [this.i18n().body_gv(), this.i18n().body_board()]);

  protected approvedAtI18n = computed(() => ({
    name: 'approvedAt', label: this.i18n().approvedAt(), placeholder: this.i18n().approvedAt_placeholder()
  } as DateInputI18n));
  protected approvedByI18n = computed(() => ({ name: 'approvedBy', label: this.i18n().approvedBy() } as StringSelectI18n));
  protected approvalRefI18n = computed(() => ({
    name: 'approvalRef', label: this.i18n().approvalRef(), placeholder: this.i18n().approvalRef_placeholder(), helper: this.i18n().approvalRef_helper()
  } as TextInputI18n));

  constructor() {
    effect(() => this.valid.emit(this.approveForm().valid()));
  }

  protected onFieldChange(fieldName: keyof BudgetApprovalFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
