import { Signal } from '@angular/core';

const PFX = '@finance/accounting/feature.';

export const ACCOUNTING_I18N_KEYS = {
  read_only_title: PFX + 'readonly.title',
  read_only_msg:   PFX + 'readonly.msg',

  // Verlauf of an invoice or bill (finance-comments); the event labels are resolved per entry by CommentTextPipe
  history_title: PFX + 'history.title',
  history_empty: PFX + 'history.empty',

  // voucher tiles (Belege) on bookings and bills, spec 1.74
  voucher_title:      PFX + 'voucher.title',
  voucher_load_error: PFX + 'voucher.loadError',

  // ledger card: the bookings / booking accounts of an invoice or bill
  ledger_bookings:         PFX + 'ledger.bookings',
  ledger_accounts:         PFX + 'ledger.accounts',
  ledger_debit:            PFX + 'ledger.debit',
  ledger_credit:           PFX + 'ledger.credit',
  ledger_date:             PFX + 'ledger.date',
  ledger_text:             PFX + 'ledger.text',
  ledger_amount:           PFX + 'ledger.amount',
  ledger_show_journal:     PFX + 'ledger.showJournal',
  ledger_show_details:     PFX + 'ledger.showDetails',
  ledger_load_error:       PFX + 'ledger.loadError',
  ledger_status_draft:     PFX + 'ledger.status.draft',
  ledger_status_forReview: PFX + 'ledger.status.forReview',
  ledger_status_cancelled: PFX + 'ledger.status.cancelled',

  settings_title:           PFX + 'settings.title',
  expense_account:          PFX + 'settings.expenseAccount.label',
  expense_account_helper:   PFX + 'settings.expenseAccount.helper',
  payables_account:         PFX + 'settings.payablesAccount.label',
  payables_account_helper:  PFX + 'settings.payablesAccount.helper',
  receivables_account:         PFX + 'settings.receivablesAccount.label',
  receivables_account_helper:  PFX + 'settings.receivablesAccount.helper',
  discount_account:            PFX + 'settings.discountAccount.label',
  discount_account_helper:     PFX + 'settings.discountAccount.helper',
  invoice_template:            PFX + 'settings.invoiceTemplate.label',
  invoice_template_placeholder: PFX + 'settings.invoiceTemplate.placeholder',
  invoice_template_helper:     PFX + 'settings.invoiceTemplate.helper',
  invoice_template_add:        PFX + 'settings.invoiceTemplate.add',
  payment_accounts:            PFX + 'settings.paymentAccounts.label',
  payment_accounts_helper:     PFX + 'settings.paymentAccounts.helper',
  bill_payables_account:          PFX + 'settings.billPayablesAccount.label',
  bill_payables_account_helper:   PFX + 'settings.billPayablesAccount.helper',
  bill_payment_accounts:          PFX + 'settings.billPaymentAccounts.label',
  bill_payment_accounts_helper:   PFX + 'settings.billPaymentAccounts.helper',
  fiscal_year_start:             PFX + 'settings.fiscalYearStart.label',
  fiscal_year_start_placeholder: PFX + 'settings.fiscalYearStart.placeholder',
  fiscal_year_start_helper:      PFX + 'settings.fiscalYearStart.helper',
  // Kostenrechnung (1.65): the accounting-wide fallback Kostenstelle
  cost_center:                   PFX + 'settings.costCenter.label',
  cost_center_helper:            PFX + 'settings.costCenter.helper',
  // Mahnwesen (1.76 phase 3): reminder template, fee account, fees per level, grace and due days
  reminder_template:             PFX + 'settings.reminderTemplate.label',
  reminder_template_placeholder: PFX + 'settings.reminderTemplate.placeholder',
  reminder_template_helper:      PFX + 'settings.reminderTemplate.helper',
  reminder_fee_account:          PFX + 'settings.reminderFeeAccount.label',
  reminder_fee_account_helper:   PFX + 'settings.reminderFeeAccount.helper',
  reminder_fee_1:                PFX + 'settings.reminderFee.level1',
  reminder_fee_2:                PFX + 'settings.reminderFee.level2',
  reminder_fee_3:                PFX + 'settings.reminderFee.level3',
  reminder_fee_default:          PFX + 'settings.reminderFee.default',
  reminder_fee_placeholder:      PFX + 'settings.reminderFee.placeholder',
  reminder_fee_helper:           PFX + 'settings.reminderFee.helper',
  reminder_grace_days:             PFX + 'settings.reminderGraceDays.label',
  reminder_grace_days_placeholder: PFX + 'settings.reminderGraceDays.placeholder',
  reminder_grace_days_helper:      PFX + 'settings.reminderGraceDays.helper',
  reminder_due_days:               PFX + 'settings.reminderDueDays.label',
  reminder_due_days_placeholder:   PFX + 'settings.reminderDueDays.placeholder',
  reminder_due_days_helper:        PFX + 'settings.reminderDueDays.helper',
  incoming_payment_label:             PFX + 'settings.incomingPaymentLabel.label',
  incoming_payment_label_placeholder: PFX + 'settings.incomingPaymentLabel.placeholder',
  incoming_payment_label_helper:      PFX + 'settings.incomingPaymentLabel.helper',
  outgoing_payment_label:             PFX + 'settings.outgoingPaymentLabel.label',
  outgoing_payment_label_placeholder: PFX + 'settings.outgoingPaymentLabel.placeholder',
  outgoing_payment_label_helper:      PFX + 'settings.outgoingPaymentLabel.helper',
  save:                     '@save.label',
  cancel:                   '@cancel',

  // Fee schedule (Gebührenplan) — section title, year selector, action-sheet actions and
  // per-field label/placeholder/helper for every FeePositionRule field.
  feeSchedule_title:                  PFX + 'feeSchedule.title',
  feeSchedule_year_label:             PFX + 'feeSchedule.year.label',

  feeSchedule_action_addPosition:     PFX + 'feeSchedule.action.addPosition',
  feeSchedule_action_deletePosition:  PFX + 'feeSchedule.action.deletePosition',
  feeSchedule_action_copyYear:        PFX + 'feeSchedule.action.copyYear',

  feeSchedule_deletePosition_confirm: PFX + 'feeSchedule.deletePosition.confirm',

  feeSchedule_position_key_label:             PFX + 'feeSchedule.position.key.label',
  feeSchedule_position_key_placeholder:       PFX + 'feeSchedule.position.key.placeholder',
  feeSchedule_position_key_helper:            PFX + 'feeSchedule.position.key.helper',

  feeSchedule_position_usage_label:           PFX + 'feeSchedule.position.usage.label',
  feeSchedule_position_usage_placeholder:     PFX + 'feeSchedule.position.usage.placeholder',
  feeSchedule_position_usage_helper:          PFX + 'feeSchedule.position.usage.helper',

  feeSchedule_position_type_label:            PFX + 'feeSchedule.position.type.label',
  feeSchedule_position_type_placeholder:      PFX + 'feeSchedule.position.type.placeholder',
  feeSchedule_position_type_helper:           PFX + 'feeSchedule.position.type.helper',

  feeSchedule_position_label_label:           PFX + 'feeSchedule.position.label.label',
  feeSchedule_position_label_placeholder:     PFX + 'feeSchedule.position.label.placeholder',
  feeSchedule_position_label_helper:          PFX + 'feeSchedule.position.label.helper',

  feeSchedule_position_source_label:          PFX + 'feeSchedule.position.source.label',
  feeSchedule_position_source_placeholder:    PFX + 'feeSchedule.position.source.placeholder',
  feeSchedule_position_source_helper:         PFX + 'feeSchedule.position.source.helper',

  feeSchedule_position_categoryList_label:       PFX + 'feeSchedule.position.categoryList.label',
  feeSchedule_position_categoryList_placeholder: PFX + 'feeSchedule.position.categoryList.placeholder',
  feeSchedule_position_categoryList_helper:      PFX + 'feeSchedule.position.categoryList.helper',
  feeSchedule_position_categoryList_prices:      PFX + 'feeSchedule.position.categoryList.prices',
  feeSchedule_position_categoryList_edit:        PFX + 'feeSchedule.position.categoryList.edit',

  feeSchedule_position_flag_label:            PFX + 'feeSchedule.position.flag.label',
  feeSchedule_position_flag_placeholder:      PFX + 'feeSchedule.position.flag.placeholder',
  feeSchedule_position_flag_helper:           PFX + 'feeSchedule.position.flag.helper',

  feeSchedule_position_rule_label:            PFX + 'feeSchedule.position.rule.label',
  feeSchedule_position_rule_placeholder:      PFX + 'feeSchedule.position.rule.placeholder',
  feeSchedule_position_rule_helper:           PFX + 'feeSchedule.position.rule.helper',

  feeSchedule_position_proRata_label:         PFX + 'feeSchedule.position.proRata.label',
  feeSchedule_position_proRata_helper:        PFX + 'feeSchedule.position.proRata.helper',
  feeSchedule_position_amount_label:          PFX + 'feeSchedule.position.amount.label',
  feeSchedule_position_amount_placeholder:    PFX + 'feeSchedule.position.amount.placeholder',
  feeSchedule_position_amount_helper:         PFX + 'feeSchedule.position.amount.helper',

  feeSchedule_position_accountKey_label:       PFX + 'feeSchedule.position.accountKey.label',
  feeSchedule_position_accountKey_placeholder: PFX + 'feeSchedule.position.accountKey.placeholder',
  feeSchedule_position_accountKey_helper:      PFX + 'feeSchedule.position.accountKey.helper',

  feeSchedule_position_vatCodeKey_label:       PFX + 'feeSchedule.position.vatCodeKey.label',
  feeSchedule_position_vatCodeKey_placeholder: PFX + 'feeSchedule.position.vatCodeKey.placeholder',
  feeSchedule_position_vatCodeKey_helper:      PFX + 'feeSchedule.position.vatCodeKey.helper',
} satisfies Record<string, string>;

export type AccountingI18n = { [K in keyof typeof ACCOUNTING_I18N_KEYS]: Signal<string> };
