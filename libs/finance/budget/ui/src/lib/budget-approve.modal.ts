import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { BudgetVersionModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, DateFormat, getTodayStr } from '@okr/shared-util-core';

import { BUDGET_I18N_KEYS, BudgetApprovalFormModel, BudgetI18n } from '@okr/finance-budget-util';

import { BudgetApproveForm } from './budget-approve.form';

/**
 * Approves one draft version: header (names the version) + change-confirmation + `okr-budget-approve-form`.
 * Dismisses with role 'confirm' and the BudgetApprovalFormModel; the opener runs the approval batch.
 */
@Component({
  selector: 'okr-budget-approve-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, BudgetApproveForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-budget-approve-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [supersededNote]="supersededNote()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class BudgetApproveModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(BUDGET_I18N_KEYS) as BudgetI18n;

  // inputs (componentProps)
  public readonly version = input.required<BudgetVersionModel>();
  /** name of the approved version this approval supersedes; '' = none */
  public readonly supersededName = input('');
  public readonly readOnly = input(false);

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected showForm = signal(true);
  public formData = linkedSignal<BudgetApprovalFormModel>(() => this.initialModel());

  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));
  protected headerTitle = computed(() => `${this.i18n.approve()}: ${this.version().name}`);
  protected supersededNote = computed(() => {
    const _name = this.supersededName();
    return _name ? this.i18n.approve_supersedes().replace('{name}', _name) : this.i18n.approve_supersedesNone();
  });

  private initialModel(): BudgetApprovalFormModel {
    return { approvedAt: getTodayStr(DateFormat.StoreDate), approvedBy: '', approvalRef: '' };
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initialModel());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: BudgetApprovalFormModel): void {
    this.formData.set(formData);
  }
}
