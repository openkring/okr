import { Signal } from '@angular/core';

const PFX = '@resource/feature.';

export const RESOURCE_I18N_KEYS = {
  resource:                 PFX + 'resource',
  resources:                PFX + 'resources',
  empty:                    PFX + 'empty',
  all:                      PFX + 'all',

  create:                   PFX + 'create.label',
  delete:                   PFX + 'delete.label',
  update:                   PFX + 'update.label',
  view:                     PFX + 'view.label',
  select:                   PFX + 'select.label',

  as_title:                 '@actionsheet.title',
  description:              '@description',
  name:                     '@name.label',
  value:                    '@value',
  cancel:                   '@cancel',
  ok:                       '@ok',
  save:                     '@save.label',

  bkey_label:               PFX + 'bkey.label',
  bkey_placeholder:         PFX + 'bkey.placeholder',
  bkey_helper:              PFX + 'bkey.helper',

  color_label:              PFX + 'color.label',

  currentValue_label:       PFX + 'currentValue.label',
  currentValue_placeholder: PFX + 'currentValue.placeholder',
  currentValue_helper:      PFX + 'currentValue.helper',

  description_label:        PFX + 'description.label',
  description_placeholder:  PFX + 'description.placeholder',

  keyNr_label:              PFX + 'keyNr.label',
  keyNr_placeholder:        PFX + 'keyNr.placeholder',
  keyNr_helper:             PFX + 'keyNr.helper',

  lockerNr_label:           PFX + 'lockerNr.label',
  lockerNr_placeholder:     PFX + 'lockerNr.placeholder',
  lockerNr_helper:          PFX + 'lockerNr.helper',

  load_label:               PFX + 'load.label',
  load_placeholder:         PFX + 'load.placeholder',
  load_helper:              PFX + 'load.helper',

  name_label:               PFX + 'name.label',
  name_placeholder:         PFX + 'name.placeholder',
  name_helper:              PFX + 'name.helper',

  type_label:               PFX + 'type.label',

  boat_view:                PFX + 'boat.view.label',
  boat_update:              PFX + 'boat.update.label',
  boat_create:              PFX + 'boat.create.label',
  boat_form_title:          PFX + 'type.boat.formTitle',

  car_form_title:           PFX + 'type.car.formTitle',

  key_view:                 PFX + 'key.view.label',
  key_update:               PFX + 'key.update.label',
  key_delete:               PFX + 'key.delete.label',
  key_create:               PFX + 'key.create.label',
  key_form_title:           PFX + 'type.key.formTitle',
  key_plural:               PFX + 'type.key.plural',
  key_name:                 PFX + 'type.key.name',
  key_empty:                PFX + 'type.key.empty',
  key_nr:                   PFX + 'keyNr.label',

  locker_view:              PFX + 'locker.view.label',
  locker_update:            PFX + 'locker.update.label',
  locker_delete:            PFX + 'locker.delete.label',
  locker_create:            PFX + 'locker.create.label',
  locker_form_title:        PFX + 'type.locker.formTitle',
  locker_plural:            PFX + 'type.locker.plural',
  locker_nr:                PFX + 'lockerNr.label',
  locker_empty:             PFX + 'type.locker.empty',

  pet_form_title:           PFX + 'type.pet.formTitle',

  rboat_create:             PFX + 'rboat.create.label',
  rboat_view:               PFX + 'rboat.view.label',
  rboat_update:             PFX + 'rboat.update.label',
  rboat_delete:             PFX + 'rboat.delete.label',
  rboat_name:               PFX + 'type.rboat.name',
  rboat_empty:              PFX + 'type.rboat.empty',
  rboat_type:               PFX + 'type.rboat.type',
  rboat_form_title:         PFX + 'type.rboat.formTitle',
  rboat_plural:             PFX + 'type.rboat.plural',

  realEstate_form_title:    PFX + 'type.realestate.formTitle',
  other_form_title:         PFX + 'type.other.formTitle'

} satisfies Record<string, string>;

export type ResourceI18n = { [K in keyof typeof RESOURCE_I18N_KEYS]: Signal<string> };

