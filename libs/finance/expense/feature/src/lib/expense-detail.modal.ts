import { Component, input, linkedSignal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { ExpenseModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';

import { ExpenseEditFormValue, toExpenseFormValue } from '@okr/finance-expense-util';
import { ExpenseEditForm } from '@okr/finance-expense-ui';

import { injectExpenseView } from './expense-view';

/**
 * The read-only view of an expense ("Spesen anzeigen"). It renders the very form the treasurer
 * edits, in `readOnly` mode, so the view and the edit modal always show the same content. The
 * header's close button (the 'cancel' icon) dismisses it.
 *
 * It does NOT inject `ExpenseStore`: the store opens this modal via a dynamic import, and a mutual
 * import leaves the store undefined at module init.
 */
@Component({
  selector: 'okr-expense-detail-modal',
  standalone: true,
  imports: [Header, ExpenseEditForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: view.i18n.view_title() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <okr-expense-edit-form
        [formData]="formData()"
        [expense]="expense()"
        [readOnly]="true"
        [i18n]="view.formI18n"
        [statuses]="view.stateCategory()"
        [authorKey]="view.authorKey()"
        [authorName]="view.authorName()"
        [receipts]="view.receipts()"
        [qrCode]="view.qrCode()"
        [imgixBaseUrl]="view.imgixBaseUrl"
        (receiptSelected)="view.showReceiptActions($event)"
      />
    </ion-content>
  `,
})
export class ExpenseDetailModal {
  public readonly expense = input.required<ExpenseModel>();

  protected readonly view = injectExpenseView(this.expense);
  protected readonly formData = linkedSignal<ExpenseEditFormValue>(() => toExpenseFormValue(this.expense()));
}
