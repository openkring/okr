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

  as_title:         '@actionsheet.title',
  ok:               '@ok',
  cancel:           '@cancel',
  save:             '@save.label'
} satisfies Record<string, string>;

export type InvoiceI18n = { [K in keyof typeof INVOICE_I18N_KEYS]: Signal<string> };

/**
 * The i18n entry for every refusal reason `writeInvoice` / `issueInvoice` can send (details.reason, or
 * one of details.reasons of `issue-blocked`). A reason missing here falls back to the generic text.
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
};

/**
 * The friendly text for a failed invoice call: the text of each known reason, joined; `fallback`
 * when no reason is known (a network error, an unexpected server state).
 */
export function invoiceRefusalText(reasons: string[], i18n: InvoiceI18n, fallback: string): string {
  const texts = [...new Set(reasons.map((r) => INVOICE_REFUSAL_I18N[r]).filter((k) => !!k))].map((k) => i18n[k]());
  return texts.length > 0 ? texts.join(' ') : fallback;
}
