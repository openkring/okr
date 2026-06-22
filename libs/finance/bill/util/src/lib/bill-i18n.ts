import { Signal } from '@angular/core';

const PFX = '@finance/bill/feature.';

export const BILL_I18N_KEYS = {
  bill:                 PFX + 'singular',
  bills:                PFX + 'plural',
  empty:                PFX + 'empty',

  id:                   PFX + 'id',
  title:                PFX + 'id',
  bill_date:            PFX + 'date.bill.label',
  due_date:             PFX + 'date.due.label',
  payment_date:         PFX + 'date.payment.label',
  amount:               PFX + 'amount',
  notes:                PFX + 'notes',
  state:                PFX + 'state',

  list_title:           PFX + 'list.title',

  download:             PFX + 'download.label',
  view:                 PFX + 'view.label',

  as_title:             '@actionsheet.title',
  cancel:               '@cancel',
  ok:                   '@ok'
} satisfies Record<string, string>;

export type BillI18n = { [K in keyof typeof BILL_I18N_KEYS]: Signal<string> };
