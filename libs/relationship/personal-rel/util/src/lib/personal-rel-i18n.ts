import { Signal } from '@angular/core';

const PFX = '@relationship/personal-rel/feature.';

export const PERSONAL_REL_I18N_KEYS = {
  title:                           PFX + 'title',
  person1:                         PFX + 'person1',
  type:                            PFX + 'type',
  person2:                         PFX + 'person2',
  delete_confirm:                  PFX + 'delete.confirm',
  as_title:                        PFX + 'actionsheet.title',
  as_view:                         PFX + 'actionsheet.view',
  as_edit:                         PFX + 'actionsheet.edit',
  as_end:                          PFX + 'actionsheet.end',
  as_delete:                       PFX + 'actionsheet.delete',
  as_create:                       PFX + 'actionsheet.create',
  ok:                              '@ok',
  cancel:                          '@cancel',
  save:                            '@save.label',

  selectLabel:                     PFX + 'select.label',
  bkey_label:                      PFX + 'bkey.label',
  bkey_placeholder:                PFX + 'bkey.placeholder',
  bkey_helper:                     PFX + 'bkey.helper',
  label_label:                     PFX + 'label.label',
  label_placeholder:               PFX + 'label.placeholder',
  label_helper:                    PFX + 'label.helper',
  notes_label:                     PFX + 'notes.label',
  notes_placeholder:               PFX + 'notes.placeholder',
  validFrom_label:                 PFX + 'validFrom.label',
  validFrom_placeholder:           PFX + 'validFrom.placeholder',
  validFrom_helper:                PFX + 'validFrom.helper',
  validTo_label:                   PFX + 'validTo.label',
  validTo_placeholder:             PFX + 'validTo.placeholder',
  validTo_helper:                  PFX + 'validTo.helper',
} satisfies Record<string, string>;

export type PersonalRelI18n = { [K in keyof typeof PERSONAL_REL_I18N_KEYS]: Signal<string> };
