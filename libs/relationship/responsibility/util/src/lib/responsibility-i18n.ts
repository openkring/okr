import { Signal } from '@angular/core';

const PFX = '@relationship/responsibility/feature.';

export const RESPONSIBILITY_I18N_KEYS = {
  label:                          PFX + 'label',
  responsibility:                 PFX + 'responsibility',
  responsibilities:               PFX + 'responsibilities',
  responsible:                    PFX + 'responsible',
  delegate:                       PFX + 'delegate',
  empty:                          PFX + 'empty',

  create:                         PFX + 'create.label',
  create_conf:                    PFX + 'create.conf',
  create_error:                   PFX + 'create.error',

  delete:                         PFX + 'delete.label',
  delete_confirm:                 PFX + 'delete.confirm',
  delete_conf:                    PFX + 'delete.conf',
  delete_error:                   PFX + 'delete.error',

  export_raw:                     PFX + 'export.raw',

  select_responsible:             PFX + 'select.responsible',
  select_delegate:                PFX + 'select.delegate',

  update:                         PFX + 'update.label',
  update_conf:                    PFX + 'update.conf',
  update_error:                   PFX + 'update.error',
  update_header:                  PFX + 'update.header',
  update_message1:                PFX + 'update.message1',
  update_message2:                PFX + 'update.message2',

  view:                           PFX + 'view.label',

  list_title:                     PFX + 'list.title',
  list_header_responsible:        PFX + 'list.header.responsible',
  list_header_delegate:           PFX + 'list.header.delegate',
  list_header_validFrom:          PFX + 'list.header.validFrom',
  list_header_validTo:            PFX + 'list.header.validTo',
  list_header_category:           PFX + 'list.header.category',

  bkey_label:                     PFX + 'bkey.label',
  bkey_placeholder:               PFX + 'bkey.placeholder',
  bkey_helper:                    PFX + 'bkey.helper',

  notes_label:                    PFX + 'notes.label',
  notes_placeholder:              PFX + 'notes.placeholder',
  notes_helper:                   PFX + 'notes.helper',

  name_label:                      PFX + 'name.label',
  name_placeholder:                PFX + 'name.placeholder',
  name_helper:                     PFX + 'name.helper',

  validFrom_label:                 PFX + 'validFrom.label',
  validFrom_placeholder:           PFX + 'validFrom.placeholder',
  validFrom_helper:                PFX + 'validFrom.helper',

  validTo_label:                   PFX + 'validTo.label',
  validTo_placeholder:             PFX + 'validTo.placeholder',
  validTo_helper:                  PFX + 'validTo.helper',

  delegateValidFrom_label:         PFX + 'delegateValidFrom.label',
  delegateValidFrom_placeholder:   PFX + 'delegateValidFrom.placeholder',
  delegateValidFrom_helper:        PFX + 'delegateValidFrom.helper',
  
  delegateValidTo_label:           PFX + 'delegateValidTo.label',
  delegateValidTo_placeholder:     PFX + 'delegateValidTo.placeholder',
  delegateValidTo_helper:          PFX + 'delegateValidTo.helper',

  as_title:                        '@actionsheet.title',
  copy_conf:                       '@copy.conf',
  ok:                              '@ok',
  cancel:                          '@cancel',
  save:                            '@save.label'
} satisfies Record<string, string>;

export type ResponsibilityI18n = { [K in keyof typeof RESPONSIBILITY_I18N_KEYS]: Signal<string> };
