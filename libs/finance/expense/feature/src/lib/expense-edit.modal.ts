import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';

import { ExpenseModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay, showToast } from '@okr/shared-util-angular';
import { lockedExpenseFields } from '@okr/shared-util-core';

import { ExpenseService, UpdateExpensePayload } from '@okr/finance-expense-data-access';
import { EXPENSE_EDIT_STATES, ExpenseEditFormValue, getExpenseEditStateCategory, toExpenseFormValue } from '@okr/finance-expense-util';
import { ExpenseEditForm } from '@okr/finance-expense-ui';

import { injectExpenseCostCenters, injectExpenseView } from './expense-view';

/**
 * The treasurer's edit modal for a single expense ("Spesen bearbeiten"). Same form as the view
 * modal (`expense-detail.modal.ts`), with the editable fields enabled and the account picker shown.
 *
 * It deliberately does NOT inject `ExpenseStore`: the store opens this modal (via a dynamic
 * import), and a mutual import leaves the store undefined at module init — Ionic then dies with
 * "Cannot read properties of undefined (reading 'provide')".
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
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-expense-edit-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [expense]="expense()"
          [readOnly]="false"
          [i18n]="view.formI18n"
          [lockedFields]="formLockedFields()"
          [statuses]="statuses()"
          [authorKey]="view.authorKey()"
          [authorName]="view.authorName()"
          [accounts]="view.accounts()"
          [costCenters]="costCenters.costCenters()"
          [costCentersEnabled]="costCenters.costCentersEnabled()"
          [projects]="costCenters.projects()"
          [payeeKey]="view.payeeKey()"
          [payeeName]="view.payeeName()"
          [receipts]="view.receipts()"
          [qrBills]="view.qrBills()"
          [qrCode]="view.qrCode()"
          [imgixBaseUrl]="view.imgixBaseUrl"
          [showForm]="showForm()"
          (receiptSelected)="view.showReceiptActions($event)"
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

  // inputs (set via componentProps by ExpenseStore.editExpense)
  public readonly expense = input.required<ExpenseModel>();

  protected readonly view = injectExpenseView(this.expense);
  /** the Kostenstellen of the expense's own book, never the accounting shell's */
  protected readonly costCenters = injectExpenseCostCenters(this.expense);
  protected readonly i18n = this.view.i18n;

  // signals
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());

  /** The editable projection of the expense; a booked expense keeps its accounting fields locked. */
  public readonly formData = linkedSignal<ExpenseEditFormValue>(() => toExpenseFormValue(this.expense()));

  protected readonly lockedFields = computed(() => lockedExpenseFields(this.expense()));

  /**
   * The stored status, coalesced EXACTLY as `toExpenseFormValue` coalesces it. Firestore reads skip
   * model defaults, so a legacy document has no `status` field at all; if the two fallbacks
   * disagreed, an untouched absent status would look "changed" and be sent — and VALID_STATUS
   * would reject it, making the document permanently unsavable.
   */
  private readonly storedStatus = computed(() => this.expense().status ?? 'draft');

  /** Whether the stored status is one a treasurer may set by hand at all ('draft' is not). */
  private readonly statusEditable = computed(() =>
    (EXPENSE_EDIT_STATES as string[]).includes(this.storedStatus()));

  /**
   * The hand-settable picker for a hand-settable status; otherwise the FULL category, read-only.
   * okr-cat-select falls back to `items()[0]` when the current value is not in its category, so
   * showing a 'draft' expense the short list would render a false status — and one confirming tap
   * would send it.
   */
  protected readonly statuses = computed(() => this.statusEditable()
    ? getExpenseEditStateCategory(this.view.stateCategory())
    : this.view.stateCategory());

  /**
   * What the FORM renders read-only. Separate from `lockedFields()`, which stays the pure
   * `lockedExpenseFields` result that `save()` uses to decide which accounting fields to omit.
   */
  protected readonly formLockedFields = computed(() => this.statusEditable()
    ? this.lockedFields()
    : [...this.lockedFields(), 'status']);

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

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
      accountKey:   value.accountKey,
      costCenterId: value.costCenterId,
      projectKey:   value.projectKey,
      note:         value.note,
    };
    // Only send the status when the treasurer actually moved it: echoing back an untouched
    // 'draft' would be refused by the callable's VALID_STATUS and make the save impossible.
    if (value.status !== this.storedStatus()) payload.status = value.status;
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
    this.formData.set(toExpenseFormValue(this.expense()));
    // destroy and recreate the form so Vest starts from a clean state
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
