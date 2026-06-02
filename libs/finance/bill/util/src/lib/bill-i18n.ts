import { Signal } from '@angular/core';

const PFX = '@finance/bill/feature.';

export const BILL_I18N_KEYS = {
  list_title:      '@finance.bill.list.title',
  accordion_title: '@finance.bill.accordion.title',
  field_empty:     '@finance.bill.field.empty',
  as_view:         PFX + 'actionsheet.view',
  as_download:     PFX + 'actionsheet.download',
  cancel:          '@cancel',
} satisfies Record<string, string>;

export type BillI18n = { [K in keyof typeof BILL_I18N_KEYS]: Signal<string> };
