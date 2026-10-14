import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { IonBadge, IonContent, IonFab, IonFabButton, IonHeader, IonButtons, IonButton, IonMenuButton, IonIcon,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { AccountingBooks, AccountingSegments, AccountingStore } from '@okr/finance-accounting-feature';

import { PaymentStore } from './payment.store';

@Component({
  selector: 'okr-payment-order-list',
  standalone: true,
  imports: [AccountingSegments, AccountingBooks, IonHeader, IonButtons, IonButton, IonMenuButton, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonBadge, IonFab, IonFabButton, IonIcon, SvgIconPipe],
  providers: [PaymentStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
        <okr-accounting-books slot="end" />
        <ion-buttons slot="end">
          <ion-button (click)="showInfo()" [attr.aria-label]="store.i18n.info_title()">
            <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <okr-accounting-segments />
    </ion-header>
    <ion-content>
      @if (store.isLoading()) { <p>Loading...</p> }
      @else if (store.orders().length === 0) { <p>{{ store.i18n.empty() }}</p> }
      @else {
        <ion-list>
          @for (order of store.orders(); track order.okey) {
            <ion-item (click)="navigate(order.okey)">
              <ion-label>
                <h3>{{ order.messageId }}</h3>
                <p>{{ order.executionDate }} | {{ order.deliveryMethod }}</p>
              </ion-label>
              <ion-badge slot="end" [color]="order.status === 'approved' ? 'success' : 'medium'">
                {{ order.status }}
              </ion-badge>
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
  private readonly modalController = inject(ModalController);

  /** (i): how payment orders work, and the other ways to pay and settle a bill */
  protected async showInfo(): Promise<void> {
    const { PaymentOrderInfoModal } = await import('@okr/finance-payment-ui');
    const modal = await this.modalController.create({ component: PaymentOrderInfoModal, componentProps: { i18n: this.store.i18n } });
    await modal.present();
  }

  protected navigate(orderKey: string): void {
    const tenantId = this.accountingStore.accountingTenantId();
    this.router.navigate(['/accounting', tenantId, 'payments', orderKey]);
  }
}
