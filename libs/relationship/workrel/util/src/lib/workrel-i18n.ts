import { Signal } from '@angular/core';

const PFX = '@relationship/workrel/feature.';

export const WORKREL_I18N_KEYS = {
  workrel:                          PFX + 'workrel',
  workrels:                         PFX + 'workrels',
  desc:                             PFX + 'desc',
  reldesc:                          PFX + 'reldesc',
  revreldesc:                       PFX + 'revreldesc',
  empty:                            PFX + 'empty',

  create:                           PFX + 'create.label',
  create_conf:                      PFX + 'create.conf',
  create_error:                     PFX + 'create.error',

  delete:                           PFX + 'delete.label',
  delete_confirm:                   PFX + 'delete.confirm',
  delete_conf:                      PFX + 'delete.conf',
  delete_error:                     PFX + 'delete.error',

  end:                              PFX + 'end.label',
  select_label:                     PFX + 'select.label',

  update:                           PFX + 'update.label',
  update_conf:                      PFX + 'update.conf',
  update_error:                     PFX + 'update.error',

  view:                             PFX + 'view.label',

  list_title:                       PFX + 'list.title',
  list_empty:                       PFX + 'list.empty',
  list_header_type:                 PFX + 'list.header.type',
  list_header_subject:              PFX + 'list.header.subject',
  list_header_object:               PFX + 'list.header.object',

  selectLabel:                      PFX + 'select.label',

  bkey_label:                       PFX + 'bkey.label',
  bkey_placeholder:                 PFX + 'bkey.placeholder',
  bkey_helper:                      PFX + 'bkey.helper',

  label_label:                      PFX + 'label.label',
  label_placeholder:                PFX + 'label.placeholder',
  label_helper:                     PFX + 'label.helper',

  currency_label:                   PFX + 'currency.label',
  currency_placeholder:             PFX + 'currency.placeholder',
  currency_helper:                  PFX + 'currency.helper',

  order_label:                      PFX + 'order.label',
  order_placeholder:                PFX + 'order.placeholder',
  order_helper:                     PFX + 'order.helper',

  price_label:                      PFX + 'price.label',
  price_placeholder:                PFX + 'price.placeholder',
  price_helper:                     PFX + 'price.helper',

  notes_label:                      PFX + 'notes.label',
  notes_placeholder:                PFX + 'notes.placeholder',

  validFrom_label:                  PFX + 'validFrom.label',
  validFrom_placeholder:            PFX + 'validFrom.placeholder',
  validFrom_helper:                 PFX + 'validFrom.helper',

  validTo_label:                    PFX + 'validTo.label',
  validTo_placeholder:              PFX + 'validTo.placeholder',
  validTo_helper:                   PFX + 'validTo.helper',

  subject:                          PFX + 'subject',
  type:                             PFX + 'type',
  object:                           PFX + 'object',


  // workrel_type: explicit
  // workrel_state: explicit

  as_title:                        '@actionsheet.title',
  cancel:                          '@cancel',
  ok:                              '@ok',
  save:                            '@save.label',
} satisfies Record<string, string>;

export type WorkrelI18n = { [K in keyof typeof WORKREL_I18N_KEYS]: Signal<string> };
