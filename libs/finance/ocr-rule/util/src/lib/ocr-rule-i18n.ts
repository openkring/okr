import { Signal } from '@angular/core';

export const OCR_RULE_I18N_KEYS = {
  list_title:    '@finance/ocr-rule/feature.list.title',
  empty:         '@finance/ocr-rule/feature.empty',
  usage_invoice: '@finance/ocr-rule/feature.usage.invoice',
  usage_expense: '@finance/ocr-rule/feature.usage.expense',
  usage_paper:   '@finance/ocr-rule/feature.usage.paper',
  inactive:      '@finance/ocr-rule/feature.inactive',
  save:          '@save.label',
  cancel:        '@cancel',
} satisfies Record<string, string>;

export type OcrRuleI18n = { [K in keyof typeof OCR_RULE_I18N_KEYS]: Signal<string> };
