import { Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  ModalController,
  IonBadge, IonButton, IonButtons, IonContent,
  IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ExpenseDocumentModel, ExpenseModel } from '@bk2/shared-models';
import { centsToCHF } from '@bk2/finance-expense-util';
import { ExpenseDocumentService } from '@bk2/finance-expense-data-access';

@Component({
  selector: 'bk-expense-detail-modal',
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
          <ion-button (click)="dismiss()">Schliessen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item>
          <ion-label>
            <h3>Betrag</h3>
            <p>{{ toCHF(expense().amountTotal) }} {{ expense().currency }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            <h3>IBAN</h3>
            <p>{{ expense().iban }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label><h3>Status</h3></ion-label>
          <ion-badge slot="end">{{ expense().status }}</ion-badge>
        </ion-item>
        @if (expense().bookingKey) {
          <ion-item>
            <ion-label>
              <h3>Buchungsreferenz</h3>
              <p>{{ expense().bookingKey }}</p>
            </ion-label>
          </ion-item>
        }
        @if (expense().note) {
          <ion-item>
            <ion-label>
              <h3>Notiz</h3>
              <p>{{ expense().note }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>

      @if (docs().length > 0) {
        <ion-list>
          @for (doc of docs(); track doc.bkey; let i = $index) {
            <ion-item>
              <ion-label>Beleg {{ i + 1 }}</ion-label>
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
  private readonly expenseDocService = inject(ExpenseDocumentService);

  protected readonly toCHF = centsToCHF;

  private readonly docsResource = rxResource<ExpenseDocumentModel[], unknown>({
    stream: () => this.expenseDocService.listForExpense(this.expense().bkey),
  });

  protected docs(): ExpenseDocumentModel[] {
    return this.docsResource.value() ?? [];
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
