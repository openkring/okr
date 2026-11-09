import { Signal } from '@angular/core';

/**
 * MUST mirror the lib's physical path under `libs/` — the strings live in `libs/finance/collection/feature/src/i18n`
 * → `'@finance/collection/feature.'`. A wrong prefix makes every key 404 at runtime, silently.
 */
const PFX = '@finance/collection/feature.';

export const COLLECTION_I18N_KEYS = {
  billing_title: PFX + 'billing.title',
  loading: PFX + 'loading',
  error_generic: PFX + 'error_generic',
  ok: PFX + 'ok',
  cancel: PFX + 'cancel',
  save: PFX + 'save',

  method_title: PFX + 'method.title',
  method_none: PFX + 'method.none',
  method_add: PFX + 'method.add',
  method_change: PFX + 'method.change',
  method_remove: PFX + 'method.remove',
  method_remove_confirm: PFX + 'method.remove_confirm',
  method_removed: PFX + 'method.removed',
  method_saved: PFX + 'method.saved',
  method_saving: PFX + 'method.saving',
  method_cancelled: PFX + 'method.cancelled',

  credit_title: PFX + 'credit.title',
  credit_balance: PFX + 'credit.balance',
  topup_button: PFX + 'topup.button',
  topup_header: PFX + 'topup.header',
  topup_placeholder: PFX + 'topup.placeholder',
  topup_next: PFX + 'topup.next',
  topup_amount_invalid: PFX + 'topup.amount_invalid',

  entries_title: PFX + 'entries.title',
  entries_empty: PFX + 'entries.empty',
  entry_topup: PFX + 'entries.kind.topup',
  entry_deduction: PFX + 'entries.kind.deduction',
  entry_reversal: PFX + 'entries.kind.reversal',
  entry_correction: PFX + 'entries.kind.correction',

  autotopup_title: PFX + 'autotopup.title',
  autotopup_off: PFX + 'autotopup.off',
  autotopup_on: PFX + 'autotopup.on',
  autotopup_saved: PFX + 'autotopup.saved',
  autotopup_enabled_label: PFX + 'autotopup.enabled_label',
  autotopup_enabled_helper: PFX + 'autotopup.enabled_helper',
  autotopup_threshold_label: PFX + 'autotopup.threshold_label',
  autotopup_amount_label: PFX + 'autotopup.amount_label',
  autotopup_no_method: PFX + 'autotopup.no_method',

  pay_title: PFX + 'pay.title',
  pay_redirecting: PFX + 'pay.redirecting',
  pay_done: PFX + 'pay.done',
  pay_cancelled: PFX + 'pay.cancelled',
  pay_retry: PFX + 'pay.retry',
  pay_paid: PFX + 'pay.paid',
  pay_not_tenant: PFX + 'pay.not_tenant',
  pay_error: PFX + 'pay.error',
} satisfies Record<string, string>;

export type CollectionI18n = { [K in keyof typeof COLLECTION_I18N_KEYS]: Signal<string> };
