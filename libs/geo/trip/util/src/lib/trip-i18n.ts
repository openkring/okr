import { Signal } from '@angular/core';

const PFX = '@geo/trip/feature.';

// ---------------------------------------------------------------------------
// trip.store
// ---------------------------------------------------------------------------

export const TRIP_I18N_KEYS = {
  list_title:               PFX + 'list.title',
  empty:                    PFX + 'empty',
  cancel:                   PFX + 'cancel',
  delete_confirm:           PFX + 'delete.confirm',
  delete_reason:            PFX + 'delete.reason',
  delete_conf:              PFX + 'delete.conf',
  delete_error:             PFX + 'delete.error',
  add_title:                PFX + 'add.title',
  edit_title:               PFX + 'edit.title',
  end_title:                PFX + 'end.title',
  as_add:                   PFX + 'actionsheet.add',
  as_edit:                  PFX + 'actionsheet.edit',
  as_end:                   PFX + 'actionsheet.end',
  as_delete:                PFX + 'actionsheet.delete',
  as_report_damage:         PFX + 'actionsheet.report_damage',
  as_report_bug:            PFX + 'actionsheet.report_bug',
  as_add_guest:             PFX + 'actionsheet.add_guest',
  as_show_images:           PFX + 'actionsheet.show_images',
  warning_suspicious:       PFX + 'warning.suspicious',
  field_boat:               PFX + 'field.boat',
  field_location:           PFX + 'field.location',
  field_custom_location:    PFX + 'field.custom_location',
  field_distance:           PFX + 'field.distance',
  field_participants:       PFX + 'field.participants',
  field_notes:              PFX + 'field.notes',
  field_start_date:         PFX + 'field.start_date',
  field_start_time:         PFX + 'field.start_time',
  field_end_date:           PFX + 'field.end_date',
  field_end_time:           PFX + 'field.end_time',
  warning_distance_zero:    PFX + 'warning.distance_zero',
  warning_distance_high:    PFX + 'warning.distance_high',
  warning_seats_mismatch:   PFX + 'warning.seats_mismatch',
  location_list_view:       PFX + 'location_select.list_view',
  location_map_view:        PFX + 'location_select.map_view',
  location_search:          PFX + 'location_select.search',
  location_none:            PFX + 'location_select.none',
} satisfies Record<string, string>;

export type TripI18n = { [K in keyof typeof TRIP_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// aoc-trip (AocTripStore)
// ---------------------------------------------------------------------------

export const AOC_I18N_KEYS = {
  title:                PFX + 'aoc.title',
  trash:                PFX + 'aoc.trash',
  notes:                PFX + 'aoc.notes',
  zero_km:              PFX + 'aoc.zero_km',
  flagged:              PFX + 'aoc.flagged',
  restore:              PFX + 'aoc.restore',
  clear_flag:           PFX + 'aoc.clear_flag',
  hard_delete_confirm:  PFX + 'aoc.hard_delete_confirm',
  restore_conf:         PFX + 'aoc.restore_conf',
  restore_error:        PFX + 'aoc.restore_error',
  cancel:               PFX + 'cancel',
} satisfies Record<string, string>;

export type AocI18n = { [K in keyof typeof AOC_I18N_KEYS]: Signal<string> };
