import { Component, input } from '@angular/core';
import { IonContent } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { PaymentI18n } from '@okr/finance-payment-util';

/**
 * «So funktionieren Zahlungsaufträge» — the (i) button on the payment order list. Read-only text: why
 * a pain.001 order is optional, the other ways to pay a bill, how an order runs, and how a payment is
 * then mapped to the supplier bill. No input, so no change-confirmation; the header closes it.
 */
@Component({
  selector: 'okr-payment-order-info-modal',
  standalone: true,
  imports: [Header, IonContent],
  styles: [`
    .info { max-width: 720px; margin: 0 auto; line-height: 1.5; }
    h3 { margin: 24px 0 8px; font-size: 1.05rem; }
    ol, ul { padding-inline-start: 20px; }
    li { margin-bottom: 6px; }
    .note { color: var(--ion-color-medium-shade); }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().info_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <div class="info">
        <p>{{ i18n().info_intro() }}</p>

        <h3>{{ i18n().info_waysTitle() }}</h3>
        <ul>
          <li>{{ i18n().info_wayQr() }}</li>
          <li>{{ i18n().info_wayEbill() }}</li>
          <li>{{ i18n().info_wayIban() }}</li>
        </ul>

        <h3>{{ i18n().info_orderTitle() }}</h3>
        <ol>
          <li>{{ i18n().info_order1() }}</li>
          <li>{{ i18n().info_order2() }}</li>
          <li>{{ i18n().info_order3() }}</li>
          <li>{{ i18n().info_order4() }}</li>
        </ol>

        <h3>{{ i18n().info_mapTitle() }}</h3>
        <ul>
          <li>{{ i18n().info_mapBank() }}</li>
          <li>{{ i18n().info_mapPost() }}</li>
          <li>{{ i18n().info_mapLink() }}</li>
        </ul>
        <p class="note">{{ i18n().info_mapNote() }}</p>
      </div>
    </ion-content>
  `,
})
export class PaymentOrderInfoModal {
  public readonly i18n = input.required<PaymentI18n>();
}
