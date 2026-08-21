import { Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import {
  ModalController,
  IonBadge, IonButton, IonButtons, IonContent,
  IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ExpenseModel } from '@okr/shared-models';
import { centsToCHF, EXPENSE_I18N_KEYS, ExpenseI18n } from '@okr/finance-expense-util';
import { I18nService } from '@okr/shared-i18n';
import { ExpenseReceipt, ExpenseService } from '@okr/finance-expense-data-access';
import { dismissOverlay } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-expense-detail-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonList, IonItem, IonLabel, IonBadge,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ expense().abstract }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">{{ i18n.close() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item>
          <ion-label>
            <h3>{{ i18n.amount() }}</h3>
            <p>{{ toCHF(expense().amountTotal) }} {{ expense().currency }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            <h3>{{ i18n.detail_iban() }}</h3>
            <p>{{ expense().iban }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label><h3>{{ i18n.detail_status() }}</h3></ion-label>
          <ion-badge slot="end">{{ expense().status }}</ion-badge>
        </ion-item>
        @if (expense().bookingKey) {
          <ion-item>
            <ion-label>
              <h3>{{ i18n.detail_booking_ref() }}</h3>
              <p>{{ expense().bookingKey }}</p>
            </ion-label>
          </ion-item>
        }
        @if (expense().note) {
          <ion-item>
            <ion-label>
              <h3>{{ i18n.detail_note() }}</h3>
              <p>{{ expense().note }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>

      @if (receipts().length > 0) {
        <ion-list>
          @for (receipt of receipts(); track receipt.url; let i = $index) {
            <ion-item button (click)="open(receipt.url)">
              <ion-label>
                <h3>{{ i18n.detail_receipt() }} {{ i + 1 }}</h3>
                <p>{{ receipt.name }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class ExpenseDetailModal {
  public readonly expense = input.required<ExpenseModel>();

  private readonly modalController = inject(ModalController);
  private readonly expenseService = inject(ExpenseService);
  // Direct inject (no store): the store opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(EXPENSE_I18N_KEYS) as ExpenseI18n;

  protected readonly toCHF = centsToCHF;

  // Receipts are read straight from Storage (tenant/{tenantId}/ocr/expense/{expenseKey}/) — there
  // is no Firestore record per file. listReceipts() is a Promise, wrapped via `from` for rxResource.
  private readonly receiptsResource = rxResource<ExpenseReceipt[], unknown>({
    stream: () => from(this.expenseService.listReceipts(this.expense().okey)),
  });

  protected receipts(): ExpenseReceipt[] {
    return this.receiptsResource.value() ?? [];
  }

  protected open(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  protected async dismiss(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }
}
