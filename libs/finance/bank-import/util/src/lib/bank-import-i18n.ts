import { Signal } from '@angular/core';

/** MUST mirror the lib's path under libs/: libs/finance/bank-import/util → '@finance/bank-import/util.' */
const PFX = '@finance/bank-import/util.';

export const BANK_IMPORT_I18N_KEYS = {
  singular:             PFX + 'singular',
  plural:               PFX + 'plural',
  empty:                PFX + 'empty',
  loading:              PFX + 'loading',

  status_unmapped:      PFX + 'status.unmapped',
  status_mapped:        PFX + 'status.mapped',
  status_posted:        PFX + 'status.posted',
  status_error:         PFX + 'status.error',
  status_all:           PFX + 'status.all',
  status_open:          PFX + 'status.open',

  header_date:          PFX + 'header.date',
  header_title:         PFX + 'header.title',
  header_payee:         PFX + 'header.payee',
  header_amount:        PFX + 'header.amount',

  import_file:          PFX + 'import.file',
  import_summary_title: PFX + 'import.summary.title',
  import_summary_parsed: PFX + 'import.summary.parsed',
  import_summary_new:   PFX + 'import.summary.new',
  import_summary_duplicates: PFX + 'import.summary.duplicates',
  import_summary_mapped: PFX + 'import.summary.mapped',
  import_summary_unmapped: PFX + 'import.summary.unmapped',
  import_summary_warnings: PFX + 'import.summary.warnings',
  import_cancelled:     PFX + 'import.cancelled',

  error_unknown_format: PFX + 'error.unknownFormat',
  error_no_iban:        PFX + 'error.noIban',
  error_format_not_implemented: PFX + 'error.formatNotImplemented',
  error_empty_file:     PFX + 'error.emptyFile',
  warning_line_skipped: PFX + 'warning.lineSkipped',
  warning_saldo_mismatch: PFX + 'warning.saldoMismatch',
  warning_iban_mismatch: PFX + 'warning.ibanMismatch',
  warning_currency_mismatch: PFX + 'warning.currencyMismatch',
  warning_rule_regex_invalid: PFX + 'warning.ruleRegexInvalid',

  post:                 PFX + 'post.label',
  post_summary_title:   PFX + 'post.summary.title',
  post_summary_posted:  PFX + 'post.summary.posted',
  post_summary_failed:  PFX + 'post.summary.failed',
  post_nothing:         PFX + 'post.nothing',
  post_error_not_mapped: PFX + 'post.error.notMapped',
  post_error_period_locked: PFX + 'post.error.periodLocked',
  post_error_account_invalid: PFX + 'post.error.accountInvalid',
  post_error_profile_missing: PFX + 'post.error.profileMissing',
  post_error_unbalanced: PFX + 'post.error.unbalanced',
  post_error_unknown:   PFX + 'post.error.unknown',

  apply_rules:          PFX + 'applyRules.label',
  apply_rules_conf:     PFX + 'applyRules.conf',

  as_title:             PFX + 'as.title',
  as_create_rule:       PFX + 'as.createRule',
  as_assign:            PFX + 'as.assign',
  as_delete:            PFX + 'as.delete',
  as_open_booking:      PFX + 'as.openBooking',
  cancel:               PFX + 'cancel.label',
  delete_conf:          PFX + 'delete.conf',
  delete_error:         PFX + 'delete.error',
  update_conf:          PFX + 'update.conf',
  update_error:         PFX + 'update.error',
  create_error:         PFX + 'create.error',

  assign_title:         PFX + 'assign.title',
  title_label:          PFX + 'title.label',
  title_placeholder:    PFX + 'title.placeholder',
  title_helper:         PFX + 'title.helper',
  account_label:        PFX + 'account.label',
  account_helper:       PFX + 'account.helper',
  vat_label:            PFX + 'vat.label',
  vat_helper:           PFX + 'vat.helper',
  changeConfirmation_cancel: PFX + 'changeConfirmation.cancel',
  changeConfirmation_ok:     PFX + 'changeConfirmation.ok',
} satisfies Record<string, string>;

export type BankImportI18n = { [K in keyof typeof BANK_IMPORT_I18N_KEYS]: Signal<string> };
