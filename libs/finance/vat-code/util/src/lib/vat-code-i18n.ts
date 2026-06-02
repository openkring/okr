import { Signal } from '@angular/core';

export const VAT_CODE_I18N_KEYS = {
  list_title: '@finance/vat-code/feature.list.title',
  empty:      '@finance/vat-code/feature.empty',
  code_label: '@finance/vat-code/feature.code.label',
  rate_label: '@finance/vat-code/feature.rate.label',
  as_view:    '@finance/vat-code/feature.actionsheet.view',
  as_edit:    '@finance/vat-code/feature.actionsheet.edit',
  as_create:  '@finance/vat-code/feature.actionsheet.create',
  as_delete:  '@finance/vat-code/feature.actionsheet.delete',
  save:       '@save.label',
  cancel:     '@cancel',
  seed_label: '@finance/vat-code/feature.seed.label',
} satisfies Record<string, string>;

export type VatCodeI18n = { [K in keyof typeof VAT_CODE_I18N_KEYS]: Signal<string> };
