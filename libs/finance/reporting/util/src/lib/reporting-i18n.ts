import { Signal } from '@angular/core';

const PFX = '@finance/reporting/feature.';

export const REPORTING_I18N_KEYS = {
  balance_title:      PFX + 'balance.title',
  income_title:       PFX + 'income.title',
  cashflow_title:     PFX + 'cashflow.title',
  export_csv:         PFX + 'export.csv',
  export_conf:        PFX + 'export.conf',
  // PDF export (Bilanz / Erfolgsrechnung). The title/period/amount strings carry single-brace
  // placeholders filled with `fill()` — translateAll() swallows Transloco's {{…}} params.
  pdf_sheet:          PFX + 'pdf.sheet',
  pdf_final:          PFX + 'pdf.final',
  pdf_provisional:    PFX + 'pdf.provisional',
  pdf_cancel:         PFX + 'pdf.cancel',
  pdf_conf:           PFX + 'pdf.conf',
  pdf_prefix_final:   PFX + 'pdf.prefix.final',
  pdf_prefix_prov:    PFX + 'pdf.prefix.provisional',
  pdf_title_balance:  PFX + 'pdf.title.balance',
  pdf_title_income:   PFX + 'pdf.title.income',
  pdf_created:        PFX + 'pdf.created',
  pdf_address:        PFX + 'pdf.address',
  pdf_period:         PFX + 'pdf.period',
  pdf_period_value:   PFX + 'pdf.periodValue',
  pdf_amounts:        PFX + 'pdf.amounts',
  pdf_watermark:      PFX + 'pdf.watermark',
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
