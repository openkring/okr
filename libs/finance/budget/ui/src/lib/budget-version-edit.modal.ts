import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { BudgetVersionModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { BUDGET_I18N_KEYS, BudgetI18n } from '@okr/finance-budget-util';

import { BudgetVersionForm } from './budget-version.form';

/**
 * Creates or edits one budget version: header + change-confirmation + `okr-budget-version-form`.
 * Presentational — the opener (the budget store) persists what this dismisses with role 'confirm'.
 */
@Component({
  selector: 'okr-budget-version-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, BudgetVersionForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-budget-version-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [years]="years()"
          [fiscalYearLocked]="fiscalYearLocked()"
          [baseVersionName]="baseVersionName()"
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
export class BudgetVersionEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(BUDGET_I18N_KEYS) as BudgetI18n;

  // inputs (componentProps)
  public readonly version = input.required<BudgetVersionModel>();
  public readonly years = input<number[]>([]);
  /** true once the version has lines */
  public readonly fiscalYearLocked = input(false);
  /** name of the base version when this is a copy; '' otherwise */
  public readonly baseVersionName = input('');
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.version()));

  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));
  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.version().okey ? this.i18n.update() : this.i18n.newVersion();
  });

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.version()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: BudgetVersionModel): void {
    this.formData.set(formData);
  }
}
