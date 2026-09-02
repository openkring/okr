import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ExpenseModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';

import { ExpenseReceipt, ExpenseService } from '@okr/finance-expense-data-access';
import { canEditExpense, canViewExpense, centsToCHF } from '@okr/finance-expense-util';

import { ExpenseStore } from './expense.store';

/**
 * The `/expense/:expenseKey` detail page (spec 2026-09-02 §3.4). This is the deep-link target of a
 * workflow task: a task created for an expense carries `relatedKey: 'expense.<okey>'`, which
 * RELATED_ROUTES maps to `/expense/<okey>`.
 *
 * It renders the same fields and receipts as `expense-detail.modal.ts` (and reuses its i18n keys),
 * plus the OCR error banner, the booking/task links and the treasurer edit button.
 *
 * The store is provided here (own instance, like `ExpenseList`). The page is opened by the ROUTER,
 * not by the store, so injecting the store is not the circular case that forces `openDetail` /
 * `editExpense` to import their modals dynamically.
 */
@Component({
  selector: 'okr-expense-detail-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
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
              <ion-icon slot="start" src="{{ 'create' | svgIcon }}" />
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
        @if (ocrError().length > 0) {
          <ion-card color="danger">
            <ion-card-header>
              <ion-card-title>{{ store.i18n.detail_ocr_error() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>{{ ocrError() }}</ion-card-content>
          </ion-card>
        }

        <ion-list>
          <ion-item>
            <ion-label>
              <h3>{{ store.i18n.abstract_label() }}</h3>
              <p>{{ expense()!.abstract }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <h3>{{ store.i18n.amount() }}</h3>
              <p>{{ toCHF(expense()!.amountTotal) }} {{ expense()!.currency }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <h3>{{ store.i18n.detail_iban() }}</h3>
              <p>{{ expense()!.iban }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label><h3>{{ store.i18n.detail_status() }}</h3></ion-label>
            <ion-badge slot="end">{{ expense()!.status }}</ion-badge>
          </ion-item>
          @if (expense()!.note) {
            <ion-item>
              <ion-label>
                <h3>{{ store.i18n.detail_note() }}</h3>
                <p>{{ expense()!.note }}</p>
              </ion-label>
            </ion-item>
          }
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

        @if (receipts().length > 0) {
          <ion-list>
            @for (receipt of receipts(); track receipt.url; let i = $index) {
              <ion-item button (click)="open(receipt.url)">
                <ion-label>
                  <h3>{{ store.i18n.detail_receipt() }} {{ i + 1 }}</h3>
                  <p>{{ receipt.name }}</p>
                </ion-label>
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

  protected readonly toCHF = centsToCHF;

  private readonly expenseResource = rxResource<ExpenseModel | undefined, string>({
    params: () => this.expenseKey(),
    stream: ({ params }) => this.expenseService.read(params),
  });

  // Receipts live in Storage (tenant/{tenantId}/ocr/expense/{expenseKey}/), not in Firestore.
  // listReceipts() is a Promise, wrapped via `from` for rxResource — same as the detail modal.
  private readonly receiptsResource = rxResource<ExpenseReceipt[], string>({
    params: () => this.expenseKey(),
    stream: ({ params }) => from(this.expenseService.listReceipts(params)),
  });

  protected readonly expense = computed(() => this.expenseResource.value());
  protected readonly isLoading = computed(() => this.expenseResource.isLoading());

  /** Legacy documents predate `ocrError`, so Firestore returns objects without it — coalesce. */
  protected readonly ocrError = computed(() => this.expense()?.ocrError ?? '');

  protected readonly canView = computed(() => {
    const expense = this.expense();
    return !!expense && canViewExpense(expense, this.store.currentUser());
  });

  protected readonly canEdit = computed(() => {
    const expense = this.expense();
    return !!expense && canEditExpense(expense, this.store.currentUser());
  });

  protected receipts(): ExpenseReceipt[] {
    return this.receiptsResource.value() ?? [];
  }

  protected async edit(): Promise<void> {
    const expense = this.expense();
    if (!expense) return;
    // The store reloads its own list resource; this page's single-document resource is separate,
    // so re-read it after the modal closes to show the treasurer's changes.
    await this.store.editExpense(expense);
    this.expenseResource.reload();
  }

  protected openBooking(): void {
    const expense = this.expense();
    if (expense) void this.store.openBooking(expense);
  }

  protected openTask(): void {
    const expense = this.expense();
    if (expense) void this.store.openTask(expense);
  }

  protected open(url: string): void {
    window.open(url, '_blank', 'noopener');
  }
}
