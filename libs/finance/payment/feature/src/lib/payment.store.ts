import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { PaymentOrderModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { PaymentOrderService, PaymentService } from '@bk2/finance-payment-data-access';

import { PaymentOrderEditModal } from './payment-order-edit.modal';
import { PFX } from './scope';

const PAYMENT_I18N_KEYS = {
  list_title:    PFX + 'list.title',
  empty:         PFX + 'empty',
  approve_label: PFX + 'approve.label',
  as_view:       PFX + 'actionsheet.view',
  as_edit:       PFX + 'actionsheet.edit',
  as_create:     PFX + 'actionsheet.create',
} satisfies Record<string, string>;

export type PaymentI18n = { [K in keyof typeof PAYMENT_I18N_KEYS]: Signal<string> };

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
    currentUserKey: computed(() => store.appStore.currentUser()?.bkey ?? ''),
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
        if (o.bkey?.length > 0) {
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
