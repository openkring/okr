import { Signal } from '@angular/core';

const PFX = '@relationship/transfer/feature.';

export const TRANSFER_I18N_KEYS = {
  transfer:                         PFX + 'transfer',
  transfers:                        PFX + 'transfers',
  empty:                            PFX + 'empty',
  desc:                             PFX + 'desc',
  reldesc:                          PFX + 'reldesc',
  revreldesc:                       PFX + 'revreldesc',

  add_subject_label:                PFX + 'add.subject.label',
  add_subject_conf:                 PFX + 'add.subject.conf',
  add_subject_error:                PFX + 'add.subject.error',

  add_object_label:                 PFX + 'add.object.label',
  add_object_conf:                  PFX + 'add.object.conf',
  add_object_error:                 PFX + 'add.object.error',

  create:                           PFX + 'create.label',
  create_conf:                      PFX + 'create.conf',
  create_error:                     PFX + 'create.error',

  delete:                           PFX + 'delete.label',
  delete_conf:                      PFX + 'delete.conf',
  delete_error:                     PFX + 'delete.error',

  select_resource:                  PFX + 'select.resource',

  update:                           PFX + 'update.label',
  update_conf:                      PFX + 'update.conf',
  update_error:                     PFX + 'update.error',

  view:                             PFX + 'view.label',
  
  list_title:                       PFX + 'list.title',
  list_header_type:                 PFX + 'list.header.type',
  list_header_resource:             PFX + 'list.header.resource',
  list_header_subject:              PFX + 'list.header.subject',
  list_header_object:               PFX + 'list.header.object',
  list_header_date:                 PFX + 'list.header.date',
  list_header_name:                 PFX + 'list.header.name',
  list_header_state:                PFX + 'list.header.state',

  subject:                         PFX + 'subject',
  object:                          PFX + 'object',
  date:                            PFX + 'dateOfTransfer',
  resource:                        PFX + 'resource',
  name:                            PFX + 'name',
  state:                           PFX + 'state',
  type:                             PFX + 'type',


  resourceNameLabel:               PFX + 'resource.name.label',
  selectResource:                  PFX + 'select.resource',
  
  name_label:                      PFX + 'name.label',
  name_placeholder:                PFX + 'name.placeholder',
  name_helper:                     PFX + 'name.helper',

  label_label:                     PFX + 'label.label',
  label_placeholder:               PFX + 'label.placeholder',
  label_helper:                    PFX + 'label.helper',

  currency_label:                  PFX + 'currency.label',
  currency_placeholder:            PFX + 'currency.placeholder',
  currency_helper:                 PFX + 'currency.helper',

  price_label:                     PFX + 'price.label',
  price_placeholder:               PFX + 'price.placeholder',
  price_helper:                    PFX + 'price.helper',

  notes_label:                     PFX + 'notes.label',
  notes_placeholder:               PFX + 'notes.placeholder',

  dateOfTransfer_label:            PFX + 'dateOfTransfer.label',
  dateOfTransfer_placeholder:      PFX + 'dateOfTransfer.placeholder',
  dateOfTransfer_helper:           PFX + 'dateOfTransfer.helper',

  // transfer_type: explicit
  // transfer_state: explicit

  as_title:                        '@actionsheet.title',
  cancel:                          '@cancel',
  ok:                              '@ok',
  save:                            '@save.label',
} satisfies Record<string, string>;

export type TransferI18n = { [K in keyof typeof TRANSFER_I18N_KEYS]: Signal<string> };

