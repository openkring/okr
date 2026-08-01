import { Signal } from '@angular/core';

const PFX = '@finance/reporting/feature.';

export const REPORTING_I18N_KEYS = {
  balance_title:    PFX + 'balance.title',
  income_title:     PFX + 'income.title',
  cashflow_title:   PFX + 'cashflow.title',
  export_csv:       PFX + 'export.csv',
  loading:          PFX + 'loading',
  debit:            PFX + 'debit',
  credit:           PFX + 'credit',
  net:              PFX + 'net',
} satisfies Record<string, string>;

export type ReportingI18n = { [K in keyof typeof REPORTING_I18N_KEYS]: Signal<string> };
