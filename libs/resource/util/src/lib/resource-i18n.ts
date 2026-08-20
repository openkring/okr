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

  okey_label:               PFX + 'okey.label',
  okey_placeholder:         PFX + 'okey.placeholder',
  okey_helper:              PFX + 'okey.helper',

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

  // Bootseinteilung (rboat_usage × rboat_type allocation grid)
  alloc_title:              PFX + 'allocation.title',
  alloc_empty:              PFX + 'allocation.empty',
  alloc_year:               PFX + 'allocation.year',
  alloc_target:             PFX + 'allocation.target',
  alloc_legend_title:       PFX + 'allocation.legend.title',
  alloc_legend_numbers:     PFX + 'allocation.legend.numbers',
  alloc_legend_numbersText: PFX + 'allocation.legend.numbersText',
  alloc_legend_l:           PFX + 'allocation.legend.l',
  alloc_legend_lText:       PFX + 'allocation.legend.lText',
  alloc_legend_s:           PFX + 'allocation.legend.s',
  alloc_legend_sText:       PFX + 'allocation.legend.sText',
  alloc_legend_p:           PFX + 'allocation.legend.p',
  alloc_legend_pText:       PFX + 'allocation.legend.pText',
  alloc_legend_success:     PFX + 'allocation.legend.success',
  alloc_legend_danger:      PFX + 'allocation.legend.danger',

  // slot label modal (BoatSlotForm)
  alloc_slot_title:         PFX + 'allocation.slot.formTitle',
  alloc_slot_text_label:    PFX + 'allocation.slot.text.label',
  alloc_slot_text_ph:       PFX + 'allocation.slot.text.placeholder',
  alloc_slot_text_helper:   PFX + 'allocation.slot.text.helper',
  alloc_slot_color_label:   PFX + 'allocation.slot.color.label',
  alloc_slot_color_helper:  PFX + 'allocation.slot.color.helper',
  alloc_slot_strategy_label:  PFX + 'allocation.slot.strategy.label',
  alloc_slot_strategy_helper: PFX + 'allocation.slot.strategy.helper',
  alloc_slot_type_label:    PFX + 'allocation.slot.type.label',
  alloc_slot_type_helper:   PFX + 'allocation.slot.type.helper',
  alloc_slot_price_label:   PFX + 'allocation.slot.price.label',
  alloc_slot_price_ph:      PFX + 'allocation.slot.price.placeholder',
  alloc_slot_price_helper:  PFX + 'allocation.slot.price.helper',
  alloc_slot_swisslos_label:  PFX + 'allocation.slot.swisslos.label',
  alloc_slot_swisslos_ph:     PFX + 'allocation.slot.swisslos.placeholder',
  alloc_slot_swisslos_helper: PFX + 'allocation.slot.swisslos.helper',
  alloc_slot_donations_label: PFX + 'allocation.slot.donations.label',
  alloc_slot_donations_ph:    PFX + 'allocation.slot.donations.placeholder',
  alloc_slot_donations_helper:PFX + 'allocation.slot.donations.helper',

  // Bootsstrategie table (BOAT_STRATEGY_TYPES order: buy, sell)
  alloc_strategy_buy:       PFX + 'allocation.strategyType.buy',
  alloc_strategy_sell:      PFX + 'allocation.strategyType.sell',
  strategy_title:           PFX + 'allocation.strategy.title',
  strategy_buy:             PFX + 'allocation.strategy.buy',
  strategy_sell:            PFX + 'allocation.strategy.sell',
  strategy_budget:          PFX + 'allocation.strategy.budget',
  strategy_swisslos:        PFX + 'allocation.strategy.swisslos',
  strategy_donations:       PFX + 'allocation.strategy.donations',
  strategy_effective:       PFX + 'allocation.strategy.effective',
  strategy_empty:           PFX + 'allocation.strategy.empty',
  strategy_past:            PFX + 'allocation.strategy.past',

  // BOAT_SLOT_COLORS labels, resolved in the order of that constant
  alloc_color_success:      PFX + 'allocation.color.success',
  alloc_color_danger:       PFX + 'allocation.color.danger',
  alloc_color_warning:      PFX + 'allocation.color.warning',
  alloc_color_primary:      PFX + 'allocation.color.primary',
  alloc_color_secondary:    PFX + 'allocation.color.secondary',
  alloc_color_tertiary:     PFX + 'allocation.color.tertiary',
  alloc_color_light:        PFX + 'allocation.color.light',
  alloc_color_medium:       PFX + 'allocation.color.medium',
  alloc_color_dark:         PFX + 'allocation.color.dark',
  alloc_color_none:         PFX + 'allocation.color.none',

  realEstate_form_title:    PFX + 'type.realestate.formTitle',
  other_form_title:         PFX + 'type.other.formTitle',

  // CSV export (context menu → exportRaw): toasts + column headers
  export_empty:             PFX + 'export.empty',
  export_conf:              PFX + 'export.conf',
  export_name:              PFX + 'export.name',
  export_type:              PFX + 'export.type',
  export_subType:           PFX + 'export.subType',
  export_boatType:          PFX + 'export.boatType',
  export_gender:            PFX + 'export.gender',
  export_usage:             PFX + 'export.usage',
  export_seats:             PFX + 'export.seats',
  export_brand:             PFX + 'export.brand',
  export_model:             PFX + 'export.model',
  export_id:                PFX + 'export.id',
  export_currentValue:      PFX + 'export.currentValue',
  export_weight:            PFX + 'export.weight',
  export_load:              PFX + 'export.load',
  export_length:            PFX + 'export.length',
  export_width:             PFX + 'export.width',
  export_color:             PFX + 'export.color',
  export_description:       PFX + 'export.description',
  export_tags:              PFX + 'export.tags',
  export_keyNr:             PFX + 'export.keyNr',
  export_lockerNr:          PFX + 'export.lockerNr',
  export_okey:              PFX + 'export.okey',

} satisfies Record<string, string>;

export type ResourceI18n = { [K in keyof typeof RESOURCE_I18N_KEYS]: Signal<string> };

