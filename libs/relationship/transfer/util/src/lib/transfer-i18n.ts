import { Signal } from '@angular/core';

const PFX = '@relationship/transfer/feature.';

export const TRANSFER_I18N_KEYS = {
  transfers:                       PFX + 'transfers',
  date:                            PFX + 'dateOfTransfer',
  subject:                         PFX + 'subject',
  object:                          PFX + 'object',
  resource:                        PFX + 'resource',
  name:                            PFX + 'name',
  state:                           PFX + 'state',
  as_title:                        PFX + 'actionsheet.title',
  as_edit:                         PFX + 'actionsheet.edit',
  as_view:                         PFX + 'actionsheet.view',
  as_delete:                       PFX + 'actionsheet.delete',
  as_create:                       PFX + 'actionsheet.create',
  cancel:                          '@cancel',
  ok:                              '@ok',
  save:                            '@save.label',
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
} satisfies Record<string, string>;

export type TransferI18n = { [K in keyof typeof TRANSFER_I18N_KEYS]: Signal<string> };
