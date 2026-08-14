import { Signal } from '@angular/core';

export const OCR_RULE_I18N_KEYS = {
  list_title:    '@finance/ocr-rule/feature.list.title',
  empty:         '@finance/ocr-rule/feature.empty',
  usage_invoice: '@finance/ocr-rule/feature.usage.invoice',
  usage_expense: '@finance/ocr-rule/feature.usage.expense',
  usage_paper:   '@finance/ocr-rule/feature.usage.paper',
  inactive:      '@finance/ocr-rule/feature.inactive',
  as_title:      '@finance/ocr-rule/feature.actionsheet.title',
  action_edit:   '@finance/ocr-rule/feature.actionsheet.edit',
  action_delete: '@finance/ocr-rule/feature.actionsheet.delete',
  action_account:'@finance/ocr-rule/feature.actionsheet.account',
  edit_title_ro:  '@finance/ocr-rule/feature.edit.title_readonly',
  edit_title:     '@finance/ocr-rule/feature.edit.title',
  edit_title_new: '@finance/ocr-rule/feature.edit.title_new',
  f_usage:        '@finance/ocr-rule/feature.edit.usage',
  f_usage_expense:'@finance/ocr-rule/feature.edit.usage_expense',
  f_usage_invoice:'@finance/ocr-rule/feature.edit.usage_invoice',
  f_usage_paper:  '@finance/ocr-rule/feature.edit.usage_paper',
  f_party:        '@finance/ocr-rule/feature.edit.party',
  f_aliases:      '@finance/ocr-rule/feature.edit.aliases',
  f_stored_as:    '@finance/ocr-rule/feature.edit.stored_as',
  f_account:      '@finance/ocr-rule/feature.edit.account',
  f_vat:          '@finance/ocr-rule/feature.edit.vat',
  f_cost_center:  '@finance/ocr-rule/feature.edit.cost_center',
  f_rank:         '@finance/ocr-rule/feature.edit.rank',
  f_active:       '@finance/ocr-rule/feature.edit.active',
  save:          '@save.label',
  cancel:        '@cancel',
} satisfies Record<string, string>;

export type OcrRuleI18n = { [K in keyof typeof OCR_RULE_I18N_KEYS]: Signal<string> };
