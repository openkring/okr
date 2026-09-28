import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ExpenseModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';

import { ExpenseService } from '@okr/finance-expense-data-access';
import { canEditExpense, canViewExpense, toExpenseFormValue } from '@okr/finance-expense-util';
import { ExpenseEditForm } from '@okr/finance-expense-ui';

import { injectExpenseView } from './expense-view';
import { ExpenseStore } from './expense.store';

/**
 * The `/expense/:expenseKey` detail page (spec 2026-09-02 §3.4). This is the deep-link target of a
 * workflow task: a task created for an expense carries `relatedKey: 'expense.<okey>'`, which
 * RELATED_ROUTES maps to `/expense/<okey>`.
 *
 * It renders the same read-only expense form as `expense-detail.modal.ts` (via `injectExpenseView`),
 * plus the booking/task links and the treasurer edit button.
 *
 * The store is provided here (own instance, like `ExpenseList`). The page is opened by the ROUTER,
 * not by the store, so injecting the store is not the circular case that forces `openDetail` /
 * `editExpense` to import their modals dynamically.
 */
@Component({
  selector: 'okr-expense-detail-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ExpenseEditForm,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel,
  ],
  providers: [ExpenseStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/expense/my/c-expense" />
        </ion-buttons>
        <ion-title>{{ store.i18n.detail_page_title() }}</ion-title>
        @if (canEdit()) {
          <ion-buttons slot="end">
            <ion-button (click)="edit()">
              <ion-icon slot="start" src="{{ 'edit' | svgIcon }}" />
              {{ store.i18n.action_edit() }}
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (!expense() || !canView()) {
        <okr-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        <okr-expense-edit-form
          [formData]="formData()"
          [expense]="expense()!"
          [readOnly]="true"
          [i18n]="view.formI18n"
          [statuses]="view.stateCategory()"
          [authorKey]="view.authorKey()"
          [authorName]="view.authorName()"
          [receipts]="view.receipts()"
          [qrBills]="view.qrBills()"
          [qrCode]="view.qrCode()"
          [imgixBaseUrl]="view.imgixBaseUrl"
          (receiptSelected)="view.showReceiptActions($event)"
        />

        @if (expense()!.bookingKey || expense()!.taskKey) {
          <ion-list>
            @if (expense()!.bookingKey) {
              <ion-item button (click)="openBooking()">
                <ion-label>
                  <h3>{{ store.i18n.detail_booking_ref() }}</h3>
                  <p>{{ expense()!.bookingKey }}</p>
                </ion-label>
                <ion-icon slot="end" src="{{ 'chevron-forward' | svgIcon }}" />
              </ion-item>
            }
            @if (expense()!.taskKey) {
              <ion-item button (click)="openTask()">
                <ion-label>
                  <h3>{{ store.i18n.action_openTask() }}</h3>
                  <p>{{ expense()!.taskKey }}</p>
                </ion-label>
                <ion-icon slot="end" src="{{ 'chevron-forward' | svgIcon }}" />
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `,
})
export class ExpenseDetailPage {
  /** Route param `:expenseKey`. */
  public readonly expenseKey = input.required<string>();

  protected readonly store = inject(ExpenseStore);
  private readonly expenseService = inject(ExpenseService);

  private readonly expenseResource = rxResource<ExpenseModel | undefined, string>({
    params: () => this.expenseKey(),
    stream: ({ params }) => this.expenseService.read(params),
  });

  protected readonly expense = computed(() => this.expenseResource.value());
  protected readonly isLoading = computed(() => this.expenseResource.isLoading());

  /** A placeholder while loading keeps the view helper's signals total; the template gates on expense(). */
  private readonly shownExpense = computed(() => this.expense() ?? new ExpenseModel(this.store.tenantId()));
  protected readonly view = injectExpenseView(this.shownExpense);
  protected readonly formData = computed(() => toExpenseFormValue(this.shownExpense()));

  protected readonly canView = computed(() => {
    const expense = this.expense();
    return !!expense && canViewExpense(expense, this.store.currentUser());
  });

  protected readonly canEdit = computed(() => {
    const expense = this.expense();
    return !!expense && canEditExpense(expense, this.store.currentUser());
  });

  protected async edit(): Promise<void> {
    const expense = this.expense();
    if (!expense) return;
    // The store reloads its own list resource; this page's single-document resource is separate,
    // so re-read it after the modal closes to show the treasurer's changes.
    await this.store.editExpense(expense);
    this.expenseResource.reload();
    this.view.reloadReceipts();
  }

  protected openBooking(): void {
    const expense = this.expense();
    if (expense) void this.store.openBooking(expense);
  }

  protected openTask(): void {
    const expense = this.expense();
    if (expense) void this.store.openTask(expense);
  }
}
