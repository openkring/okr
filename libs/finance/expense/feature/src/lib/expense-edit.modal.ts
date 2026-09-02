import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';

import { ENV } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { ExpenseModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay, showToast } from '@okr/shared-util-angular';
import { lockedExpenseFields } from '@okr/shared-util-core';

import { ExpenseService, UpdateExpensePayload } from '@okr/finance-expense-data-access';
import {
  EXPENSE_I18N_KEYS, ExpenseEditFormValue, ExpenseI18n, getExpenseEditStateCategory,
} from '@okr/finance-expense-util';
import { ExpenseEditForm, ExpenseEditFormI18n } from '@okr/finance-expense-ui';

/**
 * The treasurer's edit modal for a single expense.
 *
 * It deliberately does NOT inject `ExpenseStore`: the store opens this modal (via a dynamic
 * import), and a mutual import leaves the store undefined at module init — Ionic then dies with
 * "Cannot read properties of undefined (reading 'provide')". I18nService is injected directly.
 */
@Component({
  selector: 'okr-expense-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, ExpenseEditForm,
    IonContent,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.edit_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if (formData(); as formData) {
        <okr-expense-edit-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="formI18n"
          [lockedFields]="lockedFields()"
          [statuses]="statuses()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class ExpenseEditModal {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly expenseService = inject(ExpenseService);
  private readonly env = inject(ENV);
  protected readonly i18n = inject(I18nService).translateAll(EXPENSE_I18N_KEYS) as ExpenseI18n;

  // inputs (set via componentProps by ExpenseStore.editExpense)
  public readonly expense = input.required<ExpenseModel>();

  // signals
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());

  /** The editable projection of the expense; a booked expense keeps its accounting fields locked. */
  public readonly formData = linkedSignal<ExpenseEditFormValue>(() => toFormValue(this.expense()));

  protected readonly lockedFields = computed(() => lockedExpenseFields(this.expense()));
  protected readonly statuses = computed(() => getExpenseEditStateCategory(this.env.tenantId));

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  protected readonly formI18n: ExpenseEditFormI18n = {
    abstract_label:   this.i18n.abstract_label,
    amount_label:     this.i18n.amount_label,
    currency_label:   this.i18n.currency_label,
    transfer_label:   this.i18n.transfer_label,
    transfer_me:      this.i18n.transfer_me,
    transfer_issuer:  this.i18n.transfer_issuer,
    category_label:   this.i18n.category_label,
    costcenter_label: this.i18n.costcenter_label,
    note_label:       this.i18n.note_label,
    field_status:     this.i18n.field_status,
    edit_locked_hint: this.i18n.edit_locked_hint,
  };

  /******************************* actions *************************************** */
  protected onFormDataChange(formData: ExpenseEditFormValue): void {
    this.formData.set(formData);
  }

  public async save(): Promise<void> {
    const value = this.formData();
    const locked = this.lockedFields();
    // Every field except the key is optional, and the callable only compares the ones it receives.
    // Locked fields are OMITTED rather than echoed back: on a booked legacy document a missing
    // `currency` reads as undefined server-side, so sending the coalesced 'CHF' would trip the
    // failed-precondition guard and make every save fail with no way out from the UI.
    const payload: UpdateExpensePayload = {
      expenseKey:   this.expense().okey,
      abstract:     value.abstract,
      category:     value.category,
      costCenterId: value.costCenterId,
      note:         value.note,
    };
    // Only send the status when the treasurer actually moved it. The picker offers the three
    // hand-settable states only, so echoing back an untouched 'posted' / 'pending-export' /
    // 'draft' would be refused by the callable's VALID_STATUS and make the save impossible.
    if (value.status !== (this.expense().status ?? '')) payload.status = value.status;
    if (!locked.includes('amountTotal')) payload.amountTotal = value.amountTotal;
    if (!locked.includes('currency'))    payload.currency   = value.currency;
    if (!locked.includes('transferTo'))  payload.transferTo = value.transferTo;

    try {
      // 'expenses' is CF-write-only; updateExpense re-checks the treasurer role and refuses a
      // changed locked field, so an out-of-date lock in the UI cannot corrupt a booked expense.
      await this.expenseService.updateViaFunction(payload);
      await dismissOverlay(this.modalController, null, 'confirm');
    } catch (e) {
      // NOT submit_error ("Vorgang wurde zurückgerollt"): nothing is rolled back on an update.
      // This is also the toast a treasurer sees when the callable refuses a locked-field change,
      // where "rolled back" would say the exact opposite of what happened.
      console.error('ExpenseEditModal.save failed', e);
      await showToast(this.toastController, this.i18n.update_error());
    }
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(toFormValue(this.expense()));
    // destroy and recreate the form so Vest starts from a clean state
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}

/** Firestore reads skip model defaults, so every field is coalesced rather than trusted. */
function toFormValue(expense: ExpenseModel): ExpenseEditFormValue {
  return {
    abstract:     expense.abstract ?? '',
    amountTotal:  expense.amountTotal ?? 0,
    currency:     expense.currency ?? 'CHF',
    transferTo:   expense.transferTo ?? 'me',
    category:     expense.category ?? '',
    costCenterId: expense.costCenterId ?? '',
    note:         expense.note ?? '',
    status:       expense.status ?? 'draft',
  };
}
