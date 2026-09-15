import { Signal } from '@angular/core';

const PFX = '@finance/accounting/feature.';

export const ACCOUNTING_I18N_KEYS = {
  read_only_title: PFX + 'readonly.title',
  read_only_msg:   PFX + 'readonly.msg',

  settings_title:           PFX + 'settings.title',
  expense_account:          PFX + 'settings.expenseAccount.label',
  expense_account_helper:   PFX + 'settings.expenseAccount.helper',
  payables_account:         PFX + 'settings.payablesAccount.label',
  payables_account_helper:  PFX + 'settings.payablesAccount.helper',
  fiscal_year_start:             PFX + 'settings.fiscalYearStart.label',
  fiscal_year_start_placeholder: PFX + 'settings.fiscalYearStart.placeholder',
  fiscal_year_start_helper:      PFX + 'settings.fiscalYearStart.helper',
  save:                     '@save.label',
  cancel:                   '@cancel',
} satisfies Record<string, string>;

export type AccountingI18n = { [K in keyof typeof ACCOUNTING_I18N_KEYS]: Signal<string> };
