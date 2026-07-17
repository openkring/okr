import { Signal } from '@angular/core';

const PFX = '@relationship/responsibility/feature.';

export const RESPONSIBILITY_I18N_KEYS = {
  label:                          PFX + 'label',
  responsibility:                 PFX + 'responsibility',
  responsibilities:               PFX + 'responsibilities',
  responsible:                    PFX + 'responsible',
  delegate:                       PFX + 'delegate.label',
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

  okey_label:                     PFX + 'okey.label',
  okey_placeholder:               PFX + 'okey.placeholder',
  okey_helper:                    PFX + 'okey.helper',

  notes_label:                    PFX + 'notes.label',
  notes_placeholder:              PFX + 'notes.placeholder',
  notes_helper:                   PFX + 'notes.helper',

  name_label:                      PFX + 'name.label',
  name_placeholder:                PFX + 'name.placeholder',
  name_helper:                     PFX + 'name.helper',

  validFrom_label:               PFX + 'valid.from.label',
  validFrom_placeholder:         PFX + 'valid.from.placeholder',
  validFrom_helper:              PFX + 'valid.from.helper',

  validTo_label:                 PFX + 'valid.to.label',
  validTo_placeholder:           PFX + 'valid.to.placeholder',
  validTo_helper:                PFX + 'valid.to.helper',

  delegateValidFrom_label:            PFX + 'delegate.from.label',
  delegateValidFrom_placeholder:      PFX + 'delegate.from.placeholder',
  delegateValidFrom_helper:           PFX + 'delegate.from.helper',

  delegateValidTo_label:              PFX + 'delegate.to.label',
  delegateValidTo_placeholder:        PFX + 'delegate.to.placeholder',
  delegateValidTo_helper:             PFX + 'delegate.to.helper',

  as_title:                        '@actionsheet.title',
  copy_conf:                       '@copy.conf',
  ok:                              '@ok',
  cancel:                          '@cancel',
  save:                            '@save.label'
} satisfies Record<string, string>;

export type ResponsibilityI18n = { [K in keyof typeof RESPONSIBILITY_I18N_KEYS]: Signal<string> };
