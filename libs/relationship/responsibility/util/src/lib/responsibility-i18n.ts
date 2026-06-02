import { Signal } from '@angular/core';

const PFX = '@relationship/responsibility/feature.';

export const RESPONSIBILITY_I18N_KEYS = {
  responsibilities:                PFX + 'responsibilities',
  responsibility:                  PFX + 'responsibility',
  responsible:                     PFX + 'responsible',
  delegate:                        PFX + 'delegate',
  empty:                           PFX + 'empty',
  delete_confirm:                  PFX + 'delete.confirm',
  update_header:                   PFX + 'update.header',
  update_message1:                 PFX + 'update.message1',
  update_message2:                 PFX + 'update.message2',
  as_title:                        PFX + 'actionsheet.title',
  as_view:                         PFX + 'actionsheet.view',
  as_edit:                         PFX + 'actionsheet.edit',
  as_create:                       PFX + 'actionsheet.create',
  as_delete:                       PFX + 'actionsheet.delete',
  ok:                              '@ok',
  cancel:                          '@cancel',
  save:                            '@save.label',
  respId_label:                    PFX + 'respId.label',
  respId_placeholder:              PFX + 'respId.placeholder',
  respId_helper:                   PFX + 'respId.helper',
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
  copy_conf:                       '@copy.conf',
} satisfies Record<string, string>;

export type ResponsibilityI18n = { [K in keyof typeof RESPONSIBILITY_I18N_KEYS]: Signal<string> };
