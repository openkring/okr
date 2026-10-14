import type { Signal } from '@angular/core';

const PFX = '@finance/payment/feature.';

export const PAYMENT_I18N_KEYS = {
  list_title:        PFX + 'list.title',
  // «So funktionieren Zahlungsaufträge» (the (i) button on the list)
  info_title: PFX + 'info.title',
  info_intro: PFX + 'info.intro',
  info_waysTitle: PFX + 'info.waysTitle',
  info_wayQr: PFX + 'info.wayQr',
  info_wayEbill: PFX + 'info.wayEbill',
  info_wayIban: PFX + 'info.wayIban',
  info_orderTitle: PFX + 'info.orderTitle',
  info_order1: PFX + 'info.order1',
  info_order2: PFX + 'info.order2',
  info_order3: PFX + 'info.order3',
  info_order4: PFX + 'info.order4',
  info_mapTitle: PFX + 'info.mapTitle',
  info_mapBank: PFX + 'info.mapBank',
  info_mapPost: PFX + 'info.mapPost',
  info_mapLink: PFX + 'info.mapLink',
  info_mapNote: PFX + 'info.mapNote',
  empty:             PFX + 'empty',
  approve_label:     PFX + 'approve.label',
  as_view:           PFX + 'actionsheet.view',
  as_edit:           PFX + 'actionsheet.edit',
  as_create:         PFX + 'actionsheet.create',

  action_error:      PFX + 'order.action_error',
  cancel:            PFX + 'actionsheet.cancel',
  approve_button:    PFX + 'order.approve',
  approve_blocked:   PFX + 'order.approve_blocked',
  blocker_not_draft: PFX + 'blocker.not_draft',
  blocker_unprepared: PFX + 'blocker.unprepared',
  blocker_incomplete: PFX + 'blocker.incomplete',
  blocker_empty:     PFX + 'blocker.empty',
  blocker_needs_review: PFX + 'blocker.needs_review',
  blocker_no_debtor_iban: PFX + 'blocker.no_debtor_iban',
  needs_review_badge: PFX + 'payment.needs_review',
  as_confirm:        PFX + 'actionsheet.confirm',
  as_open_expense:   PFX + 'actionsheet.open_expense',

  order_title:       PFX + 'order.title',
  order_edit:        PFX + 'order.edit',
  download_pain001:  PFX + 'order.download_pain001',
  status_label:      PFX + 'order.status',
  execution_label:   PFX + 'order.execution',
  created_by_label:  PFX + 'order.created_by',
  approved_by_label: PFX + 'order.approved_by',

  debit_account_label:  PFX + 'order.debit_account.label',
  debit_account_helper: PFX + 'order.debit_account.helper',
  delivery_label:       PFX + 'order.delivery.label',
  delivery_pain001:     PFX + 'order.delivery.pain001_download',
  delivery_bexio:       PFX + 'order.delivery.bexio_api',
  delivery_ebics:       PFX + 'order.delivery.ebics',
  save:                 '@save.label',
} satisfies Record<string, string>;

export type PaymentI18n = { [K in keyof typeof PAYMENT_I18N_KEYS]: Signal<string> };
