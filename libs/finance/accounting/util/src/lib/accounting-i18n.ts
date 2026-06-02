import { Signal } from '@angular/core';

const PFX = '@finance/accounting/feature.';

export const ACCOUNTING_I18N_KEYS = {
  read_only_title: PFX + 'readonly.title',
  read_only_msg:   PFX + 'readonly.msg',
  select_tenant:   PFX + 'select.tenant',
} satisfies Record<string, string>;

export type AccountingI18n = { [K in keyof typeof ACCOUNTING_I18N_KEYS]: Signal<string> };
