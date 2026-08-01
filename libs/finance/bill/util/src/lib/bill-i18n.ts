import { Signal } from '@angular/core';

const PFX = '@finance/bill/feature.';

export const BILL_I18N_KEYS = {
  bill:                 PFX + 'singular',
  bills:                PFX + 'plural',
  empty:                PFX + 'empty',

  // simple accessors (view modal / list)
  id:                   PFX + 'id.label',
  title:                PFX + 'title.label',
  bill_date:            PFX + 'date.bill.label',
  due_date:             PFX + 'date.due.label',
  payment_date:         PFX + 'date.payment.label',
  amount:               PFX + 'amount.label',
  notes:                PFX + 'notes.label',
  state:                PFX + 'state.label',

  list_title:           PFX + 'list.title',

  // form accessors (label / placeholder / helper)
  id_label:             PFX + 'id.label',
  id_placeholder:       PFX + 'id.placeholder',
  id_helper:            PFX + 'id.helper',
  title_label:          PFX + 'title.label',
  title_placeholder:    PFX + 'title.placeholder',
  title_helper:         PFX + 'title.helper',
  bill_date_label:       PFX + 'date.bill.label',
  bill_date_placeholder: PFX + 'date.bill.placeholder',
  bill_date_helper:      PFX + 'date.bill.helper',
  due_date_label:        PFX + 'date.due.label',
  due_date_placeholder:  PFX + 'date.due.placeholder',
  due_date_helper:       PFX + 'date.due.helper',
  payment_date_label:       PFX + 'date.payment.label',
  payment_date_placeholder: PFX + 'date.payment.placeholder',
  payment_date_helper:      PFX + 'date.payment.helper',
  amount_label:         PFX + 'amount.label',
  amount_placeholder:   PFX + 'amount.placeholder',
  amount_helper:        PFX + 'amount.helper',
  notes_label:          PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',
  state_label:          PFX + 'state.label',

  // actions
  scan:                 PFX + 'scan.label',
  create:               PFX + 'create.label',
  update:               PFX + 'update.label',
  delete:               PFX + 'delete.label',
  delete_confirm:       PFX + 'delete.confirm',
  download:             PFX + 'download.label',
  view:                 PFX + 'view.label',

  // read-only banner (Bexio-managed)
  read_only_banner:     PFX + 'readonly.banner',

  // QR-scan modal
  qr_title:             PFX + 'qr.title',
  qr_process:           PFX + 'qr.process',
  qr_content_label:     PFX + 'qr.content.label',
  qr_content_placeholder: PFX + 'qr.content.placeholder',

  as_title:             '@actionsheet.title',
  cancel:               '@cancel',
  ok:                   '@ok',
  save:                 '@save.label'
} satisfies Record<string, string>;

export type BillI18n = { [K in keyof typeof BILL_I18N_KEYS]: Signal<string> };
