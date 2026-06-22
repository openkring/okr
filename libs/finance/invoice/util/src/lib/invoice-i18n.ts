import { Signal } from '@angular/core';

const PFX = '@finance/invoice/feature.';

export const INVOICE_I18N_KEYS = {
  invoice:                    PFX + 'singular',
  invoices:                   PFX + 'plural',

  invoice_aging:              PFX + 'aging',
  empty:                      PFX + 'empty',

  list_title:               PFX + 'list.title',

  id_label:                 PFX + 'id.label',
  id_placeholder:           PFX + 'id.placeholder',
  id_helper:                PFX + 'id.helper',

  invoice_date_label:               PFX + 'date.invoice.label',
  invoice_date_placeholder:         PFX + 'date.invoice.placeholder',
  invoice_date_helper:              PFX + 'date.invoice.helper',

  due_date_label:            PFX + 'date.due.label',
  due_date_placeholder:      PFX + 'date.due.placeholder',
  due_date_helper:           PFX + 'date.due.helper',

  payment_date_label:        PFX + 'date.payment.label',
  payment_date_placeholder:  PFX + 'date.payment.placeholder',
  payment_date_helper:       PFX + 'date.payment.helper',

  title_label:              PFX + 'title.label',
  title_placeholder:        PFX + 'title.placeholder',
  title_helper:             PFX + 'title.helper',

  amount_label:             PFX + 'amount.label',
  amount_placeholder:       PFX + 'amount.placeholder',
  amount_helper:            PFX + 'amount.helper',

  notes_label:              PFX + 'notes.label',
  notes_placeholder:        PFX + 'notes.placeholder',

  state_label:              PFX + 'state.label',

  bexioId_label:            PFX + 'bexio.id.label',
  bexioId_placeholder:      PFX + 'bexio.id.placeholder',
  bexioId_helper:           PFX + 'bexio.id.helper',

  posText_label:            PFX + 'position.text.label',
  posText_placeholder:      PFX + 'position.text.placeholder',
  posText_helper:           PFX + 'position.text.helper',

  posAmount_label:          PFX + 'position.amount.label',
  posAmount_placeholder:    PFX + 'position.amount.placeholder',
  posAmount_helper:         PFX + 'position.amount.helper',

  unitPrice_label:          PFX + 'position.unitPrice.label',
  unitPrice_placeholder:    PFX + 'position.unitPrice.placeholder',
  unitPrice_helper:         PFX + 'position.unitPrice.helper',

  accountId_label:          PFX + 'position.accountId.label',
  accountId_placeholder:    PFX + 'position.accountId.placeholder',
  accountId_helper:         PFX + 'position.accountId.helper',

  header_label:             PFX + 'header.label',
  header_placeholder:       PFX + 'header.placeholder',
  header_title:             PFX + 'field.header.label',

  footer_label:             PFX + 'footer.label',
  footer_placeholder:       PFX + 'footer.placeholder',
  footer_title:             PFX + 'field.footer.label',

  validFrom_label:          PFX + 'valid.from.label',
  validFrom_placeholder:    PFX + 'valid.from.placeholder',
  validFrom_helper:         PFX + 'valid.from.helper',

  validTo_label:            PFX + 'valid.to.label',
  validTo_placeholder:      PFX + 'valid.to.placeholder',
  validTo_helper:           PFX + 'valid.to.helper',

  template_label:           PFX + 'template.label',
  defaultPosition_label:    PFX + 'defaultPosition.label',
  vat_label:                PFX + 'vat.label',
  vat_type:                 PFX + 'vat.type',


  add_position:             PFX + 'add.position',

  create:                   PFX + 'create.label',
  create_conf:              PFX + 'create.conf',
  create_error:             PFX + 'create.error',

  delete:                   PFX + 'delete.label',
  delete_confirm:           PFX + 'delete.confirm',
  delete_conf:              PFX + 'delete.conf',
  delete_error:             PFX + 'delete.error',

  update:                   PFX + 'update.label',
  update_conf:              PFX + 'update.conf',
  update_error:             PFX + 'update.error',

  view:                     PFX + 'view.label',
  show_pdf:                 PFX + 'view.pdf',

  as_title:         '@actionsheet.title',
  ok:               '@ok',
  cancel:           '@cancel',
  save:             '@save.label'
} satisfies Record<string, string>;

export type InvoiceI18n = { [K in keyof typeof INVOICE_I18N_KEYS]: Signal<string> };
