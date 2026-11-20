import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { TRAINER_BILLING_I18N_KEYS, TrainerBillingI18n } from '@okr/finance-trainer-billing-util';
import { I18nService } from '@okr/shared-i18n';
import { TrainerAgreementModel, WorkEntryModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { WorkEntryForm } from './work-entry.form';

/**
 * Record or edit a work entry («Einsatz erfassen / bearbeiten», spec 1.167 §7.3). Presentational: dismisses with the
 * edited copy and role `confirm`; the caller saves it (`TrainerBillingService.saveEntry`). The caller prefills the
 * entry (agreement, tenants, books, person, date, default service, quantity and text) and passes the agreements it may
 * be booked on. An invoiced entry is frozen: open it with `readOnly`.
 */
@Component({
  selector: 'okr-work-entry-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, WorkEntryForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]="formDirty()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-work-entry-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [agreements]="agreements()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class WorkEntryEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: a store that opens this modal must not be imported back
  protected readonly i18n = inject(I18nService).translateAll(TRAINER_BILLING_I18N_KEYS) as TrainerBillingI18n;

  public readonly entry = input.required<WorkEntryModel>();
  public readonly agreements = input<TrainerAgreementModel[]>([]);
  public readonly readOnly = input(false);
  /** an invoiced entry is frozen (the rules deny any change), whatever the caller asked for */
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()) || (this.entry().state ?? 'open') !== 'open');

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.entry()));
  protected showForm = signal(true);

  /**
   * A new entry opens prefilled with a valid proposal (service, quantity and text from the event), so the bar shows
   * from the start (building-forms: the prefilled-dialog exception); a stored entry needs a change first.
   */
  protected showConfirmation = computed(() => !this.isReadOnly() && this.formValid() && (this.formDirty() || !this.entry().okey));
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.entry_edit_view();
    return this.entry().okey ? this.i18n.entry_edit_update() : this.i18n.entry_edit_create();
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.entry()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: WorkEntryModel): void {
    this.formData.set(formData);
  }
}
