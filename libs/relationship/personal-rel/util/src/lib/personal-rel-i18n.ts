import { Signal } from '@angular/core';

const PFX = '@relationship/personal-rel/feature.';

export const PERSONAL_REL_I18N_KEYS = {
  personalRel:                    PFX + 'personalrel',
  personalRels:                   PFX + 'personalrels',
  empty:                          PFX + 'empty',
  title:                          PFX + 'title',
  person1:                        PFX + 'person1',
  type:                           PFX + 'type',
  person2:                        PFX + 'person2',

  create:                         PFX + 'create.label',
  create_conf:                    PFX + 'create.conf',
  create_error:                   PFX + 'create.error',

  delete:                         PFX + 'delete.label',
  delete_confirm:                 PFX + 'delete.confirm',
  delete_conf:                    PFX + 'delete.conf',
  delete_error:                   PFX + 'delete.error',

  end:                            PFX + 'end.label',
  end_conf:                       PFX + 'end.conf',
  end_error:                      PFX + 'end.error',

  select:                         PFX + 'select.label',

  update:                         PFX + 'update.label',
  update_conf:                    PFX + 'update.conf',
  update_error:                   PFX + 'update.error',

  view:                           PFX + 'view.label',

  list_title:                     PFX + 'list.title',
  list_empty:                     PFX + 'list.empty',
  list_header_person1:            PFX + 'list.header.person1',
  list_header_person2:            PFX + 'list.header.person2',
  list_header_type:               PFX + 'list.header.type',

  bkey_label:                      PFX + 'bkey.label',
  bkey_placeholder:                PFX + 'bkey.placeholder',
  bkey_helper:                     PFX + 'bkey.helper',

  label_label:                     PFX + 'label.label',
  label_placeholder:               PFX + 'label.placeholder',
  label_helper:                    PFX + 'label.helper',

  notes_label:                     PFX + 'notes.label',
  notes_placeholder:               PFX + 'notes.placeholder',

  validFrom_label:                 PFX + 'valid.from.label',
  validFrom_placeholder:           PFX + 'valid.from.placeholder',
  validFrom_helper:                PFX + 'valid.from.helper',
  validTo_label:                   PFX + 'valid.to.label',
  validTo_placeholder:             PFX + 'valid.to.placeholder',
  validTo_helper:                  PFX + 'valid.to.helper',

// personalrel_type: explicit

  as_title:                        '@actionsheet.title',
  ok:                              '@ok',
  cancel:                          '@cancel',
  save:                            '@save.label'
} satisfies Record<string, string>;

export type PersonalRelI18n = { [K in keyof typeof PERSONAL_REL_I18N_KEYS]: Signal<string> };
