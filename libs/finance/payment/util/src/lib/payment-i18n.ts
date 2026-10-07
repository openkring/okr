import type { Signal } from '@angular/core';

const PFX = '@finance/payment/feature.';

export const PAYMENT_I18N_KEYS = {
  list_title:        PFX + 'list.title',
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
  blocker_self:      PFX + 'blocker.self',
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
