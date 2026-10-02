import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { ActionSheetButton, ActionSheetController, ToastController, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { PaymentModel, PaymentOrderModel } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { PaymentOrderService, PaymentService } from '@okr/finance-payment-data-access';
import { PAYMENT_I18N_KEYS, PaymentI18n, approveBlocker } from '@okr/finance-payment-util';

import { showToast } from '@okr/shared-util-angular';
import { PaymentStore } from './payment.store';

@Component({
  selector: 'okr-payment-order-detail-page',
  standalone: true,
  imports: [DecimalPipe, SvgIconPipe, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonButton, IonButtons,
    IonIcon, IonBadge, IonNote],
  providers: [PaymentStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ i18n.order_title() }}</ion-title>
        @if (orderResource.value(); as headerOrder) {
          <ion-buttons slot="end">
            @if (headerOrder.status === 'draft') {
              <ion-button fill="clear" [attr.aria-label]="i18n.order_edit()" (click)="edit(headerOrder)">
                <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" />
              </ion-button>
              <ion-button fill="clear" (click)="approve(headerOrder)">{{ i18n.approve_button() }}</ion-button>
            }
            @if (headerOrder.status === 'approved') {
              <ion-button fill="clear" (click)="downloadPain001(headerOrder)">{{ i18n.download_pain001() }}</ion-button>
            }
            @if (hasStoredPain001(headerOrder)) {
              <ion-button fill="clear" (click)="downloadStoredPain001(headerOrder)">{{ i18n.download_pain001() }}</ion-button>
            }
          </ion-buttons>
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
      @if (serverBlocker() || blocker(); as shown) {
        <ion-item>
          <ion-note color="warning">{{ blockerText(shown) }}</ion-note>
        </ion-item>
      }
      <ion-list>
        @for (payment of paymentsResource.value() ?? []; track payment.okey) {
          <ion-item button [detail]="false" (click)="openPayment(payment)">
            <ion-label>
              <h3>{{ payment.recipientName }} — {{ (payment.amount?.amount ?? 0) / 100 | number: '1.2-2' }} {{ payment.amount?.currency }}</h3>
              <p>{{ payment.recipientIban }}</p>
            </ion-label>
            @if (payment.needsReview) {
              <ion-badge slot="end" color="warning">{{ i18n.needs_review_badge() }}</ion-badge>
            }
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class PaymentOrderDetailPage {
  protected readonly i18n = inject(I18nService).translateAll(PAYMENT_I18N_KEYS) as PaymentI18n;
  protected readonly store = inject(PaymentStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);
  private readonly actionSheetController = inject(ActionSheetController);
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

  /** The server's answer, shown when it differs from what the client computed. */
  protected readonly serverBlocker = signal('');

  protected readonly blocker = computed(() => {
    const order = this.orderResource.value();
    if (!order || order.status !== 'draft') return '';
    return approveBlocker(order, this.paymentsResource.value() ?? [], this.appStore.currentUser()?.okey ?? '');
  });

  protected blockerText(blocker: string): string {
    const map: Record<string, () => string> = {
      'not-draft': this.i18n.blocker_not_draft, unprepared: this.i18n.blocker_unprepared,
      self: this.i18n.blocker_self, incomplete: this.i18n.blocker_incomplete,
      empty: this.i18n.blocker_empty, 'needs-review': this.i18n.blocker_needs_review,
      'no-debtor-iban': this.i18n.blocker_no_debtor_iban,
    };
    return map[blocker]?.() ?? this.i18n.approve_blocked();
  }

  /** Prepare a draft (debit account, execution date); saving takes it over as createdBy (spec 1.80 §5.3). */
  protected async edit(order: PaymentOrderModel): Promise<void> {
    this.serverBlocker.set('');
    await this.store.openEdit(order, false);
    this.orderResource.reload();
    this.paymentsResource.reload();
  }

  /** Once generated, the file is stored on the order: re-download it without regenerating. */
  protected hasStoredPain001(order: PaymentOrderModel): boolean {
    return order.status !== 'draft' && order.status !== 'approved' && !!(order.pain001Xml ?? '');
  }

  protected async downloadStoredPain001(order: PaymentOrderModel): Promise<void> {
    try {
      await this.store.downloadStoredPain001(order);
    } catch {
      await showToast(this.toastController, this.i18n.action_error());
    }
  }

  protected async approve(order: PaymentOrderModel): Promise<void> {
    this.serverBlocker.set('');
    const blocker = await this.store.approve(order);
    this.serverBlocker.set(blocker);
    this.orderResource.reload();
    this.paymentsResource.reload();
  }

  protected async downloadPain001(order: PaymentOrderModel): Promise<void> {
    try {
      await this.store.downloadPain001(order);
    } catch {
      await showToast(this.toastController, this.i18n.action_error());
    }
  }

  protected async openPayment(payment: PaymentModel): Promise<void> {
    const order = this.orderResource.value();
    const buttons: ActionSheetButton[] = [];
    if (payment.needsReview && order?.status === 'draft') {
      buttons.push({ text: this.i18n.as_confirm(), handler: async () => {
        try {
          await this.store.confirmPayment(payment);
          this.serverBlocker.set('');
          this.paymentsResource.reload();
        } catch {
          await showToast(this.toastController, this.i18n.action_error());
        }
      } });
    }
    if (payment.expenseKey) {
      buttons.push({ text: this.i18n.as_open_expense(), handler: async () => { await this.router.navigateByUrl(`/expense/${payment.expenseKey}`); } });
    }
    if (buttons.length === 0) return;
    const sheet = await this.actionSheetController.create({ buttons: [...buttons, { text: this.i18n.cancel(), role: 'cancel' }] });
    await sheet.present();
  }
}
