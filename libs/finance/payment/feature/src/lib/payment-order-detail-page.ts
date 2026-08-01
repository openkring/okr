import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { IonButton, IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { PaymentModel, PaymentOrderModel } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { PaymentOrderService, PaymentService } from '@okr/finance-payment-data-access';
import { PAYMENT_I18N_KEYS, PaymentI18n } from '@okr/finance-payment-util';

@Component({
  selector: 'okr-payment-order-detail-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonButton],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ i18n.order_title() }}</ion-title>
        @if (orderResource.value()?.status === 'approved') {
          <ion-button slot="end" fill="clear" (click)="generatePain001()">{{ i18n.download_pain001() }}</ion-button>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (orderResource.value(); as order) {
        <ion-item><ion-label>{{ i18n.status_label() }}: {{ order.status }}</ion-label></ion-item>
        <ion-item><ion-label>{{ i18n.execution_label() }}: {{ order.executionDate }}</ion-label></ion-item>
        <ion-item><ion-label>{{ i18n.created_by_label() }}: {{ order.createdBy }}</ion-label></ion-item>
        <ion-item><ion-label>{{ i18n.approved_by_label() }}: {{ order.approvedBy }}</ion-label></ion-item>
      }
      <ion-list>
        @for (payment of paymentsResource.value() ?? []; track payment.okey) {
          <ion-item>
            <ion-label>
              <h3>{{ payment.recipientName }} — {{ payment.amount?.amount }}</h3>
              <p>{{ payment.recipientIban }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class PaymentOrderDetailPage {
  protected readonly i18n = inject(I18nService).translateAll(PAYMENT_I18N_KEYS) as PaymentI18n;
  private readonly route = inject(ActivatedRoute);
  private readonly appStore = inject(AppStore);
  private readonly accountingStore = inject(AccountingStore);
  private readonly paymentOrderService = inject(PaymentOrderService);
  private readonly paymentService = inject(PaymentService);

  private readonly orderKey = this.route.snapshot.params['orderKey'] as string;
  private readonly accountingTenantId = this.accountingStore.accountingTenantId();

  // Gate both real-time reads on currentUser so they don't fire before auth is
  // resolved (which would hit the Firestore rules with request.auth == null).
  protected readonly orderResource = rxResource({
    params: () => this.appStore.currentUser(),
    stream: ({ params: currentUser }) =>
      currentUser && this.accountingTenantId
        ? this.paymentOrderService.read(this.orderKey, this.accountingTenantId)
        : of<PaymentOrderModel | undefined>(undefined),
  });

  protected readonly paymentsResource = rxResource({
    params: () => this.appStore.currentUser(),
    stream: ({ params: currentUser }) =>
      currentUser && this.accountingTenantId
        ? this.paymentService.listForOrder(this.orderKey, this.accountingTenantId)
        : of<PaymentModel[]>([]),
  });

  protected generatePain001(): void {
    console.log('generatePain001: not yet wired to CF');
  }
}
