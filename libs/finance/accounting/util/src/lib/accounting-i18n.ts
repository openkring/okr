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
  save:                     '@save.label',
  cancel:                   '@cancel',
} satisfies Record<string, string>;

export type AccountingI18n = { [K in keyof typeof ACCOUNTING_I18N_KEYS]: Signal<string> };
