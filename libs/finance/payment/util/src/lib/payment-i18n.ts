import { Signal } from '@angular/core';

export const PAYMENT_I18N_KEYS = {
  list_title:    '@finance/payment/feature.list.title',
  empty:         '@finance/payment/feature.empty',
  approve_label: '@finance/payment/feature.approve.label',
  as_view:       '@finance/payment/feature.actionsheet.view',
  as_edit:       '@finance/payment/feature.actionsheet.edit',
  as_create:     '@finance/payment/feature.actionsheet.create',
} satisfies Record<string, string>;

export type PaymentI18n = { [K in keyof typeof PAYMENT_I18N_KEYS]: Signal<string> };
