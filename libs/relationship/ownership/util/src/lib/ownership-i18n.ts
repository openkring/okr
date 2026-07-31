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

  boat_edit:                        PFX + 'boatAction.edit',
  boat_view:                        PFX + 'boatAction.view',
  owner_edit:                       PFX + 'ownerAction.edit',
  owner_view:                       PFX + 'ownerAction.view',

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

  okey_label:                       PFX + 'okey.label',
  okey_placeholder:                 PFX + 'okey.placeholder',
  okey_helper:                      PFX + 'okey.helper',

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
  
  // CSV export (context menu → exportRaw): toasts + column headers
  export_empty:                     PFX + 'export.empty',
  export_conf:                      PFX + 'export.conf',
  export_ownerName1:                PFX + 'export.ownerName1',
  export_ownerName2:                PFX + 'export.ownerName2',
  export_ownerModelType:            PFX + 'export.ownerModelType',
  export_resourceName:              PFX + 'export.resourceName',
  export_resourceType:              PFX + 'export.resourceType',
  export_subType:                   PFX + 'export.subType',
  export_boatName:                  PFX + 'export.boatName',
  export_boatType:                  PFX + 'export.boatType',
  export_lockerNr:                  PFX + 'export.lockerNr',
  export_keyNr:                     PFX + 'export.keyNr',
  export_gender:                    PFX + 'export.gender',
  export_type:                      PFX + 'export.type',
  export_state:                     PFX + 'export.state',
  export_validFrom:                 PFX + 'export.validFrom',
  export_validTo:                   PFX + 'export.validTo',
  export_count:                     PFX + 'export.count',
  export_price:                     PFX + 'export.price',
  export_currency:                  PFX + 'export.currency',
  export_notes:                     PFX + 'export.notes',
  export_tags:                      PFX + 'export.tags',
  export_okey:                      PFX + 'export.okey',
  export_ownerKey:                  PFX + 'export.ownerKey',
  export_resourceKey:               PFX + 'export.resourceKey',

  as_title:                         '@actionsheet.title',
  select:                           '@select.label',
  cancel:                           '@cancel',
  ok:                               '@ok',
  save:                             '@save.label',
} satisfies Record<string, string>;

export type OwnershipI18n = { [K in keyof typeof OWNERSHIP_I18N_KEYS]: Signal<string> };
