import { Signal } from '@angular/core';

const PFX = '@finance/invoice/feature.';

export const INVOICE_I18N_KEYS = {
  invoice:                    PFX + 'singular',
  invoices:                   PFX + 'plural',

  invoice_aging:              PFX + 'aging',
  aging_bucket_0_30:          PFX + 'aging_bucket.b0_30',
  aging_bucket_31_60:         PFX + 'aging_bucket.b31_60',
  aging_bucket_61_90:         PFX + 'aging_bucket.b61_90',
  aging_bucket_90_plus:       PFX + 'aging_bucket.b90_plus',
  aging_due_label:            PFX + 'aging_due',
  empty:                      PFX + 'empty',

  list_title:               PFX + 'list.title',

  id_label:                 PFX + 'id.label',
  id_placeholder:           PFX + 'id.placeholder',
  id_helper:                PFX + 'id.helper',

  invoice_date_label:               PFX + 'date.invoice.label',
  invoice_date_placeholder:         PFX + 'date.invoice.placeholder',
  invoice_date_helper:              PFX + 'date.invoice.helper',

  due_date_label:            PFX + 'date.due.label',
  due_date_placeholder:      PFX + 'date.due.placeholder',
  due_date_helper:           PFX + 'date.due.helper',

  payment_date_label:        PFX + 'date.payment.label',
  payment_date_placeholder:  PFX + 'date.payment.placeholder',
  payment_date_helper:       PFX + 'date.payment.helper',

  receiver_label:           PFX + 'receiver.label',

  title_label:              PFX + 'title.label',
  title_placeholder:        PFX + 'title.placeholder',
  title_helper:             PFX + 'title.helper',

  amount_label:             PFX + 'amount.label',
  amount_placeholder:       PFX + 'amount.placeholder',
  amount_helper:            PFX + 'amount.helper',

  notes_label:              PFX + 'notes.label',
  notes_placeholder:        PFX + 'notes.placeholder',

  state_label:              PFX + 'state.label',
  state_draft:              PFX + 'invoice_state.draft.label',
  state_pending:            PFX + 'invoice_state.pending.label',
  state_paid:               PFX + 'invoice_state.paid.label',
  state_overdue:            PFX + 'invoice_state.overdue.label',
  state_cancelled:          PFX + 'invoice_state.cancelled.label',

  bexioId_label:            PFX + 'bexio.id.label',
  bexioId_placeholder:      PFX + 'bexio.id.placeholder',
  bexioId_helper:           PFX + 'bexio.id.helper',

  posText_label:            PFX + 'position.text.label',
  posText_placeholder:      PFX + 'position.text.placeholder',
  posText_helper:           PFX + 'position.text.helper',

  posAmount_label:          PFX + 'position.amount.label',
  posAmount_placeholder:    PFX + 'position.amount.placeholder',
  posAmount_helper:         PFX + 'position.amount.helper',

  unitPrice_label:          PFX + 'unitPrice.label',
  unitPrice_placeholder:    PFX + 'unitPrice.placeholder',
  unitPrice_helper:         PFX + 'unitPrice.helper',

  accountId_label:          PFX + 'accountId.label',
  accountId_placeholder:    PFX + 'accountId.placeholder',
  accountId_helper:         PFX + 'accountId.helper',

  header_label:             PFX + 'header.label',
  header_placeholder:       PFX + 'header.placeholder',
  header_title:             PFX + 'header.label',

  footer_label:             PFX + 'footer.label',
  footer_placeholder:       PFX + 'footer.placeholder',
  footer_title:             PFX + 'footer.label',

  validFrom_label:          PFX + 'valid.from.label',
  validFrom_placeholder:    PFX + 'valid.from.placeholder',
  validFrom_helper:         PFX + 'valid.from.helper',

  validTo_label:            PFX + 'valid.to.label',
  validTo_placeholder:      PFX + 'valid.to.placeholder',
  validTo_helper:           PFX + 'valid.to.helper',

  template_label:           PFX + 'template.label',
  defaultPosition_label:    PFX + 'defaultPosition.label',
  vat_label:                PFX + 'vat.label',
  vat_type:                 PFX + 'vat.type',


  add_position:             PFX + 'add.position',

  create:                   PFX + 'create.label',
  create_conf:              PFX + 'create.conf',
  create_error:             PFX + 'create.error',

  delete:                   PFX + 'delete.label',
  delete_confirm:           PFX + 'delete.confirm',
  delete_conf:              PFX + 'delete.conf',
  delete_error:             PFX + 'delete.error',

  update:                   PFX + 'update.label',
  update_conf:              PFX + 'update.conf',
  update_error:             PFX + 'update.error',

  view:                     PFX + 'view.label',
  show_pdf:                 PFX + 'view.pdf',
  show_pdf_error:           PFX + 'view.pdf_error',
  show_pdf_missing:         PFX + 'view.pdf_missing',

  payment_confirmation:           PFX + 'paymentConfirmation.label',
  payment_confirmation_noAddress: PFX + 'paymentConfirmation.noAddress',
  payment_confirmation_error:     PFX + 'paymentConfirmation.error',

  read_only_banner:         PFX + 'readonly.banner',
  positions_failed:         PFX + 'readonly.positionsFailed',

  receiver_none:            PFX + 'receiver.none',
  receiver_select:          PFX + 'receiver.select',
  receiver_person:          PFX + 'receiver.person',
  receiver_org:             PFX + 'receiver.org',
  total_label:              PFX + 'total.label',

  positions_title:          PFX + 'positions.title',
  positions_name_label:     PFX + 'positions.name.label',
  positions_name_placeholder: PFX + 'positions.name.placeholder',
  positions_amount_label:   PFX + 'positions.amount.label',
  positions_amount_placeholder: PFX + 'positions.amount.placeholder',
  positions_account_label:  PFX + 'positions.account.label',
  positions_add:            PFX + 'positions.add',
  positions_remove:         PFX + 'positions.remove',
  positions_total:          PFX + 'positions.total',

  issue:                    PFX + 'issue.label',
  issue_confirm:            PFX + 'issue.confirm',
  issue_conf:               PFX + 'issue.conf',
  issue_error:              PFX + 'issue.error',

  refusal_no_positions:             PFX + 'refusal.no-positions',
  refusal_position_without_account: PFX + 'refusal.position-without-account',
  refusal_invalid_amount:           PFX + 'refusal.invalid-amount',
  refusal_total_not_positive:       PFX + 'refusal.total-not-positive',
  refusal_no_receivables_account:   PFX + 'refusal.no-receivables-account',
  refusal_no_receiver:              PFX + 'refusal.no-receiver',
  refusal_no_invoice_date:          PFX + 'refusal.no-invoice-date',
  refusal_no_invoice_template:      PFX + 'refusal.no-invoice-template',
  refusal_account_invalid:          PFX + 'refusal.account-invalid',
  refusal_period_locked:            PFX + 'refusal.period-locked',
  refusal_state_changed:            PFX + 'refusal.state-changed',
  refusal_not_a_draft:              PFX + 'refusal.not-a-draft',
  refusal_not_found:                PFX + 'refusal.not-found',
  refusal_bexio_backend:            PFX + 'refusal.bexio-backend',
  refusal_no_accounting_config:     PFX + 'refusal.no-accounting-config',
  refusal_foreign_accounting_tenant: PFX + 'refusal.foreign-accounting-tenant',
  refusal_too_many_positions:       PFX + 'refusal.too-many-positions',
  refusal_inconsistent_state:       PFX + 'refusal.inconsistent-state',
  refusal_no_due_date:              PFX + 'refusal.no-due-date',
  refusal_due_before_invoice_date:  PFX + 'refusal.due-before-invoice-date',

  payment:                  PFX + 'payment.label',
  payment_title:            PFX + 'payment.title',
  payment_conf:             PFX + 'payment.conf',
  payment_conf_paid:        PFX + 'payment.conf_paid',
  payment_error:            PFX + 'payment.error',
  payment_mode_post:        PFX + 'payment.mode.post',
  payment_mode_link:        PFX + 'payment.mode.link',
  payment_date_input_label:       PFX + 'payment.date.label',
  payment_date_input_placeholder: PFX + 'payment.date.placeholder',
  payment_date_input_helper:      PFX + 'payment.date.helper',
  payment_amount_label:       PFX + 'payment.amount.label',
  payment_amount_placeholder: PFX + 'payment.amount.placeholder',
  payment_amount_helper:      PFX + 'payment.amount.helper',
  payment_bankAccount_label:  PFX + 'payment.bankAccount.label',
  payment_bankAccount_helper: PFX + 'payment.bankAccount.helper',
  payment_booking_label:      PFX + 'payment.booking.label',
  payment_booking_helper:     PFX + 'payment.booking.helper',
  payment_booking_none:       PFX + 'payment.booking.none',
  payment_booking_failed:     PFX + 'payment.booking.failed',
  payments_title:             PFX + 'payment.list.title',
  payments_booking:           PFX + 'payment.list.booking',

  cancel_invoice:             PFX + 'cancelInvoice.label',
  cancel_invoice_message:     PFX + 'cancelInvoice.message',
  cancel_invoice_reason:      PFX + 'cancelInvoice.reason',
  cancel_invoice_date:        PFX + 'cancelInvoice.date',
  cancel_invoice_ok:          PFX + 'cancelInvoice.ok',
  cancel_invoice_conf:        PFX + 'cancelInvoice.conf',
  cancel_invoice_error:       PFX + 'cancelInvoice.error',
  cancel_invoice_reason_invalid: PFX + 'cancelInvoice.reasonInvalid',
  cancel_invoice_date_invalid:   PFX + 'cancelInvoice.dateInvalid',

  issue_all:                  PFX + 'issueAll.label',
  issue_all_confirm:          PFX + 'issueAll.confirm',
  issue_all_progress:         PFX + 'issueAll.progress',
  issue_all_done:             PFX + 'issueAll.done',
  issue_all_failed:           PFX + 'issueAll.failed',

  refusal_invalid_payment_id:       PFX + 'refusal.invalid-payment-id',
  refusal_not_a_payment_account:    PFX + 'refusal.not-a-payment-account',
  refusal_payment_blocked:          PFX + 'refusal.payment-blocked',
  refusal_link_blocked:             PFX + 'refusal.link-blocked',
  refusal_cancel_blocked:           PFX + 'refusal.cancel-blocked',
  refusal_no_bank_line:             PFX + 'refusal.no-bank-line',
  refusal_not_paid:                 PFX + 'refusal.not-paid',
  refusal_not_payable:              PFX + 'refusal.not-payable',
  refusal_overpayment:              PFX + 'refusal.overpayment',
  refusal_no_payment_date:          PFX + 'refusal.no-payment-date',
  refusal_booking_not_found:        PFX + 'refusal.booking-not-found',
  refusal_booking_not_posted:       PFX + 'refusal.booking-not-posted',
  refusal_foreign_booking:          PFX + 'refusal.foreign-booking',
  refusal_no_receivables_credit:    PFX + 'refusal.no-receivables-credit',
  refusal_already_linked:           PFX + 'refusal.already-linked',
  refusal_not_cancellable:          PFX + 'refusal.not-cancellable',
  refusal_has_payments:             PFX + 'refusal.has-payments',
  refusal_no_issue_booking:         PFX + 'refusal.no-issue-booking',
  refusal_payment_invalid_amount:   PFX + 'refusal.payment-invalid-amount',
  refusal_payment_account_invalid:  PFX + 'refusal.payment-account-invalid',
  refusal_payment_period_locked:    PFX + 'refusal.payment-period-locked',
  refusal_payment_inconsistent_state: PFX + 'refusal.payment-inconsistent-state',
  refusal_cancel_period_locked:     PFX + 'refusal.cancel-period-locked',
  refusal_cancel_inconsistent_state: PFX + 'refusal.cancel-inconsistent-state',
  refusal_confirmation_no_receiver: PFX + 'refusal.confirmation-no-receiver',

  as_title:         '@actionsheet.title',
  ok:               '@ok',
  cancel:           '@cancel',
  save:             '@save.label'
} satisfies Record<string, string>;

export type InvoiceI18n = { [K in keyof typeof INVOICE_I18N_KEYS]: Signal<string> };

/**
 * The i18n entry for every refusal reason the invoice callables can send (details.reason, or one of
 * details.reasons of an `*-blocked` refusal). A reason missing here falls back to the generic text.
 */
export const INVOICE_REFUSAL_I18N: Record<string, keyof typeof INVOICE_I18N_KEYS> = {
  'no-positions': 'refusal_no_positions',
  'position-without-account': 'refusal_position_without_account',
  'invalid-amount': 'refusal_invalid_amount',
  'total-not-positive': 'refusal_total_not_positive',
  'no-receivables-account': 'refusal_no_receivables_account',
  'no-receiver': 'refusal_no_receiver',
  'no-invoice-date': 'refusal_no_invoice_date',
  'no-invoice-template': 'refusal_no_invoice_template',
  'account-invalid': 'refusal_account_invalid',
  'period-locked': 'refusal_period_locked',
  'state-changed': 'refusal_state_changed',
  'not-a-draft': 'refusal_not_a_draft',
  'not-issuable': 'refusal_not_a_draft',
  'not-found': 'refusal_not_found',
  'bexio-backend': 'refusal_bexio_backend',
  'no-accounting-config': 'refusal_no_accounting_config',
  'foreign-accounting-tenant': 'refusal_foreign_accounting_tenant',
  'too-many-positions': 'refusal_too_many_positions',
  'inconsistent-state': 'refusal_inconsistent_state',
  'no-due-date': 'refusal_no_due_date',
  'due-before-invoice-date': 'refusal_due_before_invoice_date',
  // phase 2: payments, cancel, payment confirmation
  'invalid-payment-id': 'refusal_invalid_payment_id',
  'not-a-payment-account': 'refusal_not_a_payment_account',
  'payment-blocked': 'refusal_payment_blocked',
  'link-blocked': 'refusal_link_blocked',
  'cancel-blocked': 'refusal_cancel_blocked',
  'no-bank-line': 'refusal_no_bank_line',
  'not-paid': 'refusal_not_paid',
  'not-payable': 'refusal_not_payable',
  'overpayment': 'refusal_overpayment',
  'no-payment-date': 'refusal_no_payment_date',
  'booking-not-found': 'refusal_booking_not_found',
  'booking-not-posted': 'refusal_booking_not_posted',
  'foreign-booking': 'refusal_foreign_booking',
  'no-receivables-credit': 'refusal_no_receivables_credit',
  'already-linked': 'refusal_already_linked',
  'not-cancellable': 'refusal_not_cancellable',
  'has-payments': 'refusal_has_payments',
  'no-issue-booking': 'refusal_no_issue_booking',
};

/** Which invoice call failed — some reasons need a different text there (a payment's amount is not a position's). */
export type InvoiceRefusalContext = 'payment' | 'cancel' | 'confirmation';

/** Per-context texts that replace the general one of the same reason. */
export const INVOICE_REFUSAL_CONTEXT_I18N: Record<InvoiceRefusalContext, Record<string, keyof typeof INVOICE_I18N_KEYS>> = {
  payment: {
    'invalid-amount': 'refusal_payment_invalid_amount',
    'account-invalid': 'refusal_payment_account_invalid',
    'period-locked': 'refusal_payment_period_locked',
    'inconsistent-state': 'refusal_payment_inconsistent_state',
  },
  cancel: {
    'period-locked': 'refusal_cancel_period_locked',
    'inconsistent-state': 'refusal_cancel_inconsistent_state',
  },
  confirmation: {
    'no-receiver': 'refusal_confirmation_no_receiver',
  },
};

/**
 * The friendly text for a failed invoice call: the text of each known reason, joined; `fallback`
 * when no reason is known (a network error, an unexpected server state).
 */
export function invoiceRefusalText(reasons: string[], i18n: InvoiceI18n, fallback: string, context?: InvoiceRefusalContext): string {
  const keys = invoiceRefusalKeys(reasons, context);
  const texts = keys.map((k) => i18n[k]());
  return texts.length > 0 ? texts.join(' ') : fallback;
}

/** The i18n entries for the given reasons (context-specific first, unknown reasons dropped, no duplicates). */
export function invoiceRefusalKeys(reasons: string[], context?: InvoiceRefusalContext): (keyof typeof INVOICE_I18N_KEYS)[] {
  const overrides: Record<string, keyof typeof INVOICE_I18N_KEYS> = context ? INVOICE_REFUSAL_CONTEXT_I18N[context] : {};
  return [...new Set(reasons.map((r) => overrides[r] ?? INVOICE_REFUSAL_I18N[r]).filter((k) => !!k))];
}
