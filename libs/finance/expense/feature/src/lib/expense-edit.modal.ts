import { Component, computed, inject, Injector, input, linkedSignal, signal } from '@angular/core';
import { AlertController, IonContent, ModalController, ToastController } from '@ionic/angular';

import { AppStore } from '@okr/shared-feature';
import { ExpenseModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay, showToast } from '@okr/shared-util-angular';
import { lockedExpenseFields } from '@okr/shared-util-core';

import { ExpenseService, UpdateExpensePayload } from '@okr/finance-expense-data-access';
import {
  buildExpenseDoneMessage, EXPENSE_EDIT_STATES, ExpenseEditFormValue, expenseDoneRecipient, fillName, getExpenseEditStateCategory, toExpenseFormValue,
} from '@okr/finance-expense-util';
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
  private readonly alertController = inject(AlertController);
  private readonly expenseService = inject(ExpenseService);
  private readonly appStore = inject(AppStore);
  private readonly injector = inject(Injector);

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

    // Moving INTO 'done' is confirmed first: it closes the task and queues the refund, and the
    // treasurer may send the member a thank-you DM. Cancelling keeps the modal and the edits.
    let message = '';
    if (payload.status === 'done') {
      const answer = await this.confirmDone();
      if (answer === undefined) return;
      message = answer;
    }
    if (!locked.includes('amountTotal')) payload.amountTotal = value.amountTotal;
    if (!locked.includes('currency'))    payload.currency   = value.currency;
    if (!locked.includes('transferTo'))  payload.transferTo = value.transferTo;

    try {
      // 'expenses' is CF-write-only; updateExpense re-checks the treasurer role and refuses a
      // changed locked field, so an out-of-date lock in the UI cannot corrupt a booked expense.
      await this.expenseService.updateViaFunction(payload);
      await dismissOverlay(this.modalController, null, 'confirm');
      // after the dismiss: initialising the chat client can take seconds, the save is already done
      if (message) void this.sendDoneMessage(message);
    } catch (e) {
      // NOT submit_error ("Vorgang wurde zurückgerollt"): nothing is rolled back on an update.
      // This is also the toast a treasurer sees when the callable refuses a locked-field change,
      // where "rolled back" would say the exact opposite of what happened.
      console.error('ExpenseEditModal.save failed', e);
      await showToast(this.toastController, this.i18n.update_error());
    }
  }

  /** The recipient of the thank-you DM; nobody when the expense names no person or it is the treasurer. */
  private readonly doneRecipient = computed(() => {
    const recipient = expenseDoneRecipient(this.expense());
    const ownKey = this.appStore.currentUser()?.personKey ?? '';
    return recipient.key && recipient.key !== ownKey ? recipient : { key: '', name: '' };
  });

  /**
   * Explains what «Erledigt» sets off and offers the prefilled DM. Resolves to the message to send
   * ('' = none), or undefined when the treasurer cancels.
   */
  private async confirmDone(): Promise<string | undefined> {
    const i = this.i18n;
    const recipient = this.doneRecipient();
    const alert = await this.alertController.create({
      header: i.done_header(),
      message: buildExpenseDoneMessage({
        intro: i.done_intro(), effectTask: i.done_effect_task(), effectPayment: i.done_effect_payment(),
        effectBooking: i.done_effect_booking(), editableTitle: i.done_editable_title(), editable: i.done_editable(),
        lockedTitle: i.done_locked_title(), locked: i.done_locked(), unlocked: i.done_unlocked(),
        reopen: i.done_reopen(), dmHint: i.done_dm_hint(),
      }, {
        booked: !!this.expense().bookingKey,
        hasTask: !!this.expense().taskKey,
        recipientName: recipient.key ? (recipient.name || '?') : '',
      }),
      inputs: recipient.key
        ? [{ name: 'message', type: 'textarea', value: i.done_dm_default(), attributes: { rows: 4 } }]
        : [],
      buttons: [
        { text: i.action_cancel(), role: 'cancel' },
        { text: i.done_confirm(), role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss<{ values?: { message?: string } }>();
    if (role !== 'confirm') return undefined;
    return recipient.key ? (data?.values?.message ?? '').trim() : '';
  }

  /**
   * The thank-you DM, sent from the treasurer's own chat account. matrix-js-sdk is large, so the
   * chat data-access lib is loaded only here. A failure never undoes the save — it only says so.
   */
  private async sendDoneMessage(text: string): Promise<void> {
    const { key, name } = this.doneRecipient();
    if (!key) return;
    try {
      const { MatrixChatService } = await import('@okr/chat-data-access');
      const matrix = this.injector.get(MatrixChatService);
      await matrix.ensureInitialized();
      const room = await matrix.createDirectRoom(key);
      await matrix.sendMessage(room.roomId, text);
      await showToast(this.toastController, fillName(this.i18n.done_dm_conf(), name));
    } catch (e) {
      console.error('ExpenseEditModal.sendDoneMessage failed', e);
      await showToast(this.toastController, fillName(this.i18n.done_dm_error(), name));
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
