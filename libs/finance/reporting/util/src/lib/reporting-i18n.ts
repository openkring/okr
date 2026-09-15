import { Signal } from '@angular/core';

const PFX = '@finance/reporting/feature.';

export const REPORTING_I18N_KEYS = {
  balance_title:      PFX + 'balance.title',
  income_title:       PFX + 'income.title',
  cashflow_title:     PFX + 'cashflow.title',
  export_csv:         PFX + 'export.csv',
  export_conf:        PFX + 'export.conf',
  loading:            PFX + 'loading',
  empty:              PFX + 'empty',
  debit:              PFX + 'debit',
  credit:             PFX + 'credit',
  net:                PFX + 'net',
  col_account:        PFX + 'col.account',
  col_name:           PFX + 'col.name',
  assets:             PFX + 'section.assets',
  liabilities:        PFX + 'section.liabilities',
  revenue:            PFX + 'section.revenue',
  expense:            PFX + 'section.expense',
  result_classes:     PFX + 'section.resultClasses',
  total_assets:       PFX + 'total.assets',
  total_liabilities:  PFX + 'total.liabilities',
  total_revenue:      PFX + 'total.revenue',
  total_expense:      PFX + 'total.expense',
  year_profit:        PFX + 'result.profit',
  year_loss:          PFX + 'result.loss',
  show_zero:          PFX + 'zero.show',
  hide_zero:          PFX + 'zero.hide',
} satisfies Record<string, string>;

export type ReportingI18n = { [K in keyof typeof REPORTING_I18N_KEYS]: Signal<string> };
