import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AccountModel, BudgetLineModel, CostCenterModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { BUDGET_I18N_KEYS, BudgetI18n } from '@okr/finance-budget-util';

import { BudgetLineForm } from './budget-line.form';

/**
 * Creates or edits one budget cell: header + change-confirmation + `okr-budget-line-form`.
 * Presentational — the opener persists what this dismisses with role 'confirm'.
 */
@Component({
  selector: 'okr-budget-line-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, BudgetLineForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-budget-line-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [costCenters]="costCenters()"
          [accounts]="accounts()"
          [existingLines]="existingLines()"
          [currentUser]="currentUser()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class BudgetLineEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(BUDGET_I18N_KEYS) as BudgetI18n;

  // inputs (componentProps)
  public readonly line = input.required<BudgetLineModel>();
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly accounts = input<AccountModel[]>([]);
  public readonly existingLines = input<BudgetLineModel[]>([]);
  public readonly currentUser = input<UserModel | undefined>();
  /** pass true when the version is not editable */
  public readonly readOnly = input(true);

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.line()));

  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));
  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.line().okey ? this.i18n.update() : this.i18n.addLine();
  });

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.line()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: BudgetLineModel): void {
    this.formData.set(formData);
  }
}
