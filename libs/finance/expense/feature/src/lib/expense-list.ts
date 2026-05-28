import { Component, inject } from '@angular/core';
import {
  ModalController,
  IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { centsToCHF } from '@bk2/finance-expense-util';

import { ExpenseNewModal } from './expense-new.modal';
import { ExpenseStore } from './expense.store';

@Component({
  selector: 'bk-expense-list',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel,
    IonFab, IonFabButton, IonIcon,
    SvgIconPipe,
  ],
  providers: [ExpenseStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <p style="text-align:center">…</p>
      } @else if (store.expenses().length === 0) {
        <p style="text-align:center; padding:16px;">Keine Auslagen gefunden</p>
      } @else {
        <ion-list>
          @for (expense of store.expenses(); track expense.bkey) {
            <ion-item (click)="store.openDetail(expense)">
              <ion-label>
                <h3>{{ expense.abstract }}</h3>
                <p>{{ toCHF(expense.amountTotal) }} {{ expense.currency }} · {{ expense.status }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button (click)="openNew()">
        <ion-icon src="{{ 'add' | svgIcon }}" />
      </ion-fab-button>
    </ion-fab>
  `,
})
export class ExpenseList {
  protected readonly store = inject(ExpenseStore);
  private readonly modalController = inject(ModalController);

  protected readonly toCHF = centsToCHF;

  protected async openNew(): Promise<void> {
    const modal = await this.modalController.create({ component: ExpenseNewModal });
    await modal.present();
    const { role } = await modal.onDidDismiss();
    if (role === 'confirm') this.store.expensesResource.reload();
  }
}
