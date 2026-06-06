import { Signal } from '@angular/core';

const PFX = '@relationship/ownership/feature.';

export const OWNERSHIP_I18N_KEYS = {
  ownership:                        PFX + 'ownership',
  ownerships:                       PFX + 'ownerships',
  owner:                            PFX + 'owner',
  description:                      PFX + 'description',
  empty:                            PFX + 'empty',
  duration:                         PFX + 'duration',
  owner_name:                       PFX + 'ownerName',
  resource_name:                    PFX + 'resourceName',
  new_desc:                         PFX + 'newDesc',
  relDesc1:                         PFX + 'relDesc1',
  relDesc2:                         PFX + 'relDesc2',
  revreldesc:                       PFX + 'revreldesc',

  create:                           PFX + 'create.label',
  create_conf:                      PFX + 'create.conf',
  create_error:                     PFX + 'create.error',

  delete:                           PFX + 'delete.label',
  delete_confirm:                   PFX + 'delete.confirm',
  delete_conf:                      PFX + 'delete.conf',
  delete_error:                     PFX + 'delete.error',

  end:                              PFX + 'end.label',
  reactivate:                       PFX + 'reactivate.label',
  reactivate_conf:                  PFX + 'reactivate.conf',
  reactivate_error:                 PFX + 'reactivate.error',

  select_title:                     PFX + 'select.title',
  select_raw:                       PFX + 'select.raw',
  select_lockers:                   PFX + 'select.lockers',

  update:                           PFX + 'update.label',
  update_conf:                      PFX + 'update.label',
  update_error:                     PFX + 'update.error',
  view:                             PFX + 'view.label',

  list_empty:                       PFX + 'list.empty',
  list_header_ownerName:            PFX + 'list.header.ownerName',
  list_header_resourceName:         PFX + 'list.header.resourceName',
  list_header_duration:             PFX + 'list.header.duration',
  list_header_price:                PFX + 'list.header.price',
  list_header_deposit:              PFX + 'list.header.deposit',
  list_header_validFrom:            PFX + 'list.header.validFrom',
  list_header_validTo:              PFX + 'list.header.validTo',
  list_header_year:                 PFX + 'list.header.year',
  list_all_title:                   PFX + 'list.all.title',
  list_ownerships_title:            PFX + 'list.ownerships.title',
  list_lockers_title:               PFX + 'list.lockers.title',
  list_keys_title:                  PFX + 'list.keys.title',
  list_privateBoats_title:          PFX + 'list.privateBoats.title',
  list_scsBoats_title:              PFX + 'list.scsBoats.title',

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

  validFrom_label:                  PFX + 'valid.from.label',
  validFrom_placeholder:            PFX + 'valid.from.placeholder',
  validFrom_helper:                 PFX + 'valid.from.helper',

  validTo_label:                    PFX + 'valid.to.label',
  validTo_placeholder:              PFX + 'valid.to.placeholder',
  validTo_helper:                   PFX + 'valid.to.helper',

  // ownerType: explicit
  // state: explicit
  
  as_title:                         '@actionsheet.title',
  select:                           '@select.label',
  cancel:                           '@cancel',
  ok:                               '@ok',
  save:                             '@save.label',
} satisfies Record<string, string>;

export type OwnershipI18n = { [K in keyof typeof OWNERSHIP_I18N_KEYS]: Signal<string> };
