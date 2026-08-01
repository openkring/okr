import { Signal } from '@angular/core';

const PFX = '@finance/payment/feature.';

export const PAYMENT_I18N_KEYS = {
  list_title:        PFX + 'list.title',
  empty:             PFX + 'empty',
  approve_label:     PFX + 'approve.label',
  as_view:           PFX + 'actionsheet.view',
  as_edit:           PFX + 'actionsheet.edit',
  as_create:         PFX + 'actionsheet.create',

  order_title:       PFX + 'order.title',
  download_pain001:  PFX + 'order.download_pain001',
  status_label:      PFX + 'order.status',
  execution_label:   PFX + 'order.execution',
  created_by_label:  PFX + 'order.created_by',
  approved_by_label: PFX + 'order.approved_by',
} satisfies Record<string, string>;

export type PaymentI18n = { [K in keyof typeof PAYMENT_I18N_KEYS]: Signal<string> };
