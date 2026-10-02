import { Signal } from '@angular/core';

const PFX = '@finance/accounting/feature.';

export const ACCOUNTING_I18N_KEYS = {
  read_only_title: PFX + 'readonly.title',
  read_only_msg:   PFX + 'readonly.msg',

  // voucher tiles (Belege) on bookings and bills, spec 1.74
  voucher_title:      PFX + 'voucher.title',
  voucher_load_error: PFX + 'voucher.loadError',

  settings_title:           PFX + 'settings.title',
  expense_account:          PFX + 'settings.expenseAccount.label',
  expense_account_helper:   PFX + 'settings.expenseAccount.helper',
  payables_account:         PFX + 'settings.payablesAccount.label',
  payables_account_helper:  PFX + 'settings.payablesAccount.helper',
  receivables_account:         PFX + 'settings.receivablesAccount.label',
  receivables_account_helper:  PFX + 'settings.receivablesAccount.helper',
  invoice_template:            PFX + 'settings.invoiceTemplate.label',
  invoice_template_placeholder: PFX + 'settings.invoiceTemplate.placeholder',
  invoice_template_helper:     PFX + 'settings.invoiceTemplate.helper',
  payment_accounts:            PFX + 'settings.paymentAccounts.label',
  payment_accounts_helper:     PFX + 'settings.paymentAccounts.helper',
  fiscal_year_start:             PFX + 'settings.fiscalYearStart.label',
  fiscal_year_start_placeholder: PFX + 'settings.fiscalYearStart.placeholder',
  fiscal_year_start_helper:      PFX + 'settings.fiscalYearStart.helper',
  // Kostenrechnung (1.65): the accounting-wide fallback Kostenstelle
  cost_center:                   PFX + 'settings.costCenter.label',
  cost_center_helper:            PFX + 'settings.costCenter.helper',
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

  feeSchedule_position_flag_label:            PFX + 'feeSchedule.position.flag.label',
  feeSchedule_position_flag_placeholder:      PFX + 'feeSchedule.position.flag.placeholder',
  feeSchedule_position_flag_helper:           PFX + 'feeSchedule.position.flag.helper',

  feeSchedule_position_rule_label:            PFX + 'feeSchedule.position.rule.label',
  feeSchedule_position_rule_placeholder:      PFX + 'feeSchedule.position.rule.placeholder',
  feeSchedule_position_rule_helper:           PFX + 'feeSchedule.position.rule.helper',

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
