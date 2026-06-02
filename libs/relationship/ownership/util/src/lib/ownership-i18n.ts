import { Signal } from '@angular/core';

const PFX = '@relationship/ownership/feature.';

export const OWNERSHIP_I18N_KEYS = {
  ownerships:                       PFX + 'ownerships',
  empty:                            PFX + 'empty',
  duration:                         PFX + 'duration',
  owner_name:                       PFX + 'ownerName',
  resource_name:                    PFX + 'resourceName',
  new_desc:                         PFX + 'newDesc',
  relDesc1:                         PFX + 'relDesc1',
  relDesc2:                         PFX + 'relDesc2',

  bkey_label:                       PFX + 'bkey.label',
  bkey_placeholder:                 PFX + 'bkey.placeholder',
  bkey_helper:                      PFX + 'bkey.helper',

  ownerName1_label:                 PFX + 'ownerName1.label',
  ownerName1_placeholder:           PFX + 'ownerName1.placeholder',
  ownerName1_helper:                PFX + 'ownerName1.helper',

  ownerName2_label:                 PFX + 'ownerName2.label',
  ownerName2_placeholder:           PFX + 'ownerName2.placeholder',
  ownerName2_helper:                PFX + 'ownerName2.helper',

  currency_label:                   PFX + 'currency.label',
  currency_placeholder:             PFX + 'currency.placeholder',
  currency_helper:                  PFX + 'currency.helper',

  price_label:                      PFX + 'price.label',
  price_placeholder:                PFX + 'price.placeholder',
  price_helper:                     PFX + 'price.helper',

  notes_label:                      PFX + 'notes.label',
  notes_placeholder:                PFX + 'notes.placeholder',

  boat_name:                        PFX + 'boat.name',
  boat_type:                        PFX + 'boat.type',

  validFrom_label:                  PFX + 'validFrom.label',
  validFrom_placeholder:            PFX + 'validFrom.placeholder',
  validFrom_helper:                 PFX + 'validFrom.helper',

  validTo_label:                    PFX + 'validTo.label',
  validTo_placeholder:              PFX + 'validTo.placeholder',
  validTo_helper:                   PFX + 'validTo.helper',

  view:                             PFX + 'view.label',
  edit:                             PFX + 'edit.labe',
  end:                              PFX + 'end.label',
  create:                           PFX + 'create.label',
  delete:                           PFX + 'delete.label',
  delete_confirm:                   PFX + 'delete.confirm',

  as_title:                         '@actionsheet.title',
  select:                           '@select.label',
  cancel:                           '@cancel',
  ok:                               '@ok',
  save:                             '@save.label',
} satisfies Record<string, string>;

export type OwnershipI18n = { [K in keyof typeof OWNERSHIP_I18N_KEYS]: Signal<string> };
