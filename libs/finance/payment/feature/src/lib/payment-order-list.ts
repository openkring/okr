import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonBadge, IonButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { AccountingStore } from '@bk2/finance-accounting-feature';

import { PaymentStore } from './payment.store';

@Component({
  selector: 'bk-payment-order-list',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonBadge, IonButton, IonFab, IonFabButton, IonIcon, SvgIconPipe],
  providers: [PaymentStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) { <p>Loading...</p> }
      @else if (store.orders().length === 0) { <p>{{ store.i18n.empty() }}</p> }
      @else {
        <ion-list>
          @for (order of store.orders(); track order.bkey) {
            <ion-item (click)="navigate(order.bkey)">
              <ion-label>
                <h3>{{ order.messageId }}</h3>
                <p>{{ order.executionDate }} | {{ order.deliveryMethod }}</p>
              </ion-label>
              <ion-badge slot="end" [color]="order.status === 'approved' ? 'success' : 'medium'">
                {{ order.status }}
              </ion-badge>
              @if (order.status === 'draft' && !store.isReadOnly() && order.createdBy !== store.currentUserKey()) {
                <ion-button slot="end" fill="clear" (click)="store.approve(order); $event.stopPropagation()">
                  {{ store.i18n.approve_label() }}
                </ion-button>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
    @if (!store.isReadOnly()) {
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="store.openCreate()">
          <ion-icon src="{{ 'add' | svgIcon }}" />
        </ion-fab-button>
      </ion-fab>
    }
  `,
})
export class PaymentOrderList {
  protected readonly store = inject(PaymentStore);
  private readonly accountingStore = inject(AccountingStore);
  private readonly router = inject(Router);

  protected navigate(orderKey: string): void {
    const tenantId = this.accountingStore.accountingTenantId();
    this.router.navigate(['/accounting', tenantId, 'payments', orderKey]);
  }
}
