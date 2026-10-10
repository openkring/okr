import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { CostAllocationModel, CostCenterModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { BUDGET_I18N_KEYS, BudgetI18n } from '@okr/finance-budget-util';

import { CostAllocationForm } from './cost-allocation.form';

/**
 * Creates or edits one Umlage (spec 1.65 D24): header + change-confirmation + `okr-cost-allocation-form`.
 * Presentational — the opener persists what this dismisses with role 'confirm'.
 */
@Component({
  selector: 'okr-cost-allocation-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, CostAllocationForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-cost-allocation-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [costCenters]="costCenters()"
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
export class CostAllocationEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(BUDGET_I18N_KEYS) as BudgetI18n;

  // inputs (componentProps)
  public readonly allocation = input.required<CostAllocationModel>();
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.allocation()));

  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));
  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.allocation().okey ? this.i18n.alloc_edit() : this.i18n.alloc_new();
  });

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.allocation()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CostAllocationModel): void {
    this.formData.set(formData);
  }
}
