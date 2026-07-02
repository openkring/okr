import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PaymentOrderModel } from '@okr/shared-models';

import { AccountingStore } from '@okr/finance-accounting-feature';
import { PaymentOrderService, PaymentService } from '@okr/finance-payment-data-access';
import { PAYMENT_I18N_KEYS, PaymentI18n } from '@okr/finance-payment-util';

import { PaymentOrderEditModal } from './payment-order-edit.modal';

export const PaymentStore = signalStore(
  withState({}),
  withProps(() => ({
    paymentOrderService: inject(PaymentOrderService),
    paymentService: inject(PaymentService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(PAYMENT_I18N_KEYS),
    ordersResource: rxResource({
      params: () => store.accountingStore.accountingTenantId(),
      stream: ({ params: id }) => store.paymentOrderService.list(id),
    }),
  })),
  withComputed(store => ({
    orders: computed(() => store.ordersResource.value() ?? []),
    isLoading: computed(() => store.ordersResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    currentUserKey: computed(() => store.appStore.currentUser()?.okey ?? ''),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
  })),
  withMethods(store => ({
    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const order = new PaymentOrderModel(store.appStore.tenantId(), store.accountingTenantId());
      order.createdBy = store.currentUserKey();
      await this.openEdit(order, false);
    },

    async openEdit(order: PaymentOrderModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: PaymentOrderEditModal,
        componentProps: { order, readOnly, currentUser: store.currentUser() },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        const o = data as PaymentOrderModel;
        if (o.okey?.length > 0) {
          await store.paymentOrderService.update(o, store.currentUser() ?? undefined);
        } else {
          await store.paymentOrderService.create(o, store.currentUser() ?? undefined);
        }
        store.ordersResource.reload();
      }
    },

    async approve(order: PaymentOrderModel): Promise<void> {
      const approverId = store.currentUserKey();
      if (!approverId || approverId === order.createdBy) {
        console.warn('PaymentStore.approve: approver must be a different person from the creator');
        return;
      }
      await store.paymentOrderService.approve(order, approverId, store.currentUser() ?? undefined);
      store.ordersResource.reload();
    },
  }))
);
