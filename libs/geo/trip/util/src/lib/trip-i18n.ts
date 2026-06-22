import { Signal } from '@angular/core';

const PFX = '@geo/trip/feature.';

// ---------------------------------------------------------------------------
// trip.store
// ---------------------------------------------------------------------------

export const TRIP_I18N_KEYS = {
  trip:                     PFX + 'trip',
  trips:                    PFX + 'trips',
  desc:                     PFX + 'desc',
  empty:                    PFX + 'empty',

  create:                   PFX + 'create.label',
  create_conf:              PFX + 'create.conf',
  create_error:             PFX + 'create.error',
  create_guest:             PFX + 'create.guest',

  delete:                   PFX + 'delete.label',
  delete_confirm:           PFX + 'delete.confirm',
  delete_reason:            PFX + 'delete.reason',
  delete_conf:              PFX + 'delete.conf',
  delete_error:             PFX + 'delete.error',

  end:                      PFX + 'end.label',
  view:                     PFX + 'view.label',
  export_raw:               PFX + 'export.raw',

  report_damage:            PFX + 'report.damage.label',
  report_damage_plain:      PFX + 'report.damage.plain',
  report_damage_trip:       PFX + 'report.damage.trip',
  report_damage_prompt:     PFX + 'report.damage.prompt',

  report_bug:               PFX + 'report.bug.label',
  report_bug_plain:         PFX + 'report.bug.plain',
  report_bug_trip:          PFX + 'report.bug.trip',
  report_bug_prompt:        PFX + 'report.bug.prompt',

  search:                   PFX + 'search.label',

  select_participant_title: PFX + 'select.participant.title', 
  select_participant_add:   PFX + 'select.participant.add', 
  select_boat_title:        PFX + 'select.boat.title', 
  select_boat_add:          PFX + 'select.boat.add', 
  select_location_title:    PFX + 'select.location.title', 
  select_location_add:      PFX + 'select.location.add', 

  show_images:              PFX + 'show.images',
  show_statistics_boatkm:   PFX + 'show.statistics.boatkm',
  show_statistics_personkm: PFX + 'show.statistics.personkm',

  stats_boat_title:         PFX + 'stats.boat_title',
  stats_member_title:       PFX + 'stats.member_title',
  stats_view_list:          PFX + 'stats.view_list',
  stats_view_graph:         PFX + 'stats.view_graph',

  update:                   PFX + 'update.label',
  update_conf:              PFX + 'update.conf',
  update_error:             PFX + 'update.error',

  list_title:               PFX + 'list.title',

  warning_suspicious:       PFX + 'warning.suspicious',
  warning_distance_zero:    PFX + 'warning.distance_zero',
  warning_distance_high:    PFX + 'warning.distance_high',
  warning_seats_mismatch:   PFX + 'warning.seats_mismatch',
  warning_note:             PFX + 'warning.note',

  boat:                     PFX + 'boat',
  distance_label:           PFX + 'distance.label',
  distance_placeholder:     PFX + 'distance.placeholder',
  distance_helper:          PFX + 'distance.helper',
  participants:             PFX + 'participants',
  notes_label:              PFX + 'notes.label',
  notes_placeholder:        PFX + 'notes.placeholder',
  date:                     PFX + 'date',

  location:                 PFX + 'location.label',
  custom_location:          PFX + 'location.custom',
  location_view_list:       PFX + 'location.view.list',
  location_view_map:        PFX + 'location.view.map',
  location_search:          PFX + 'location.search',
  location_empty:           PFX + 'location.empty',
  location_none_selected:   PFX + 'location.none_selected',

  state_draft:              PFX + 'trip_state.draft.label',
  state_open:               PFX + 'trip_state.open.label',
  state_closed:             PFX + 'trip_state.closed.label',
  state_cancelled:            PFX + 'trip_state.cancelled.label',
  state_revised:            PFX + 'trip_state.revised.label',
  state_all:                PFX + 'trip_state.all.label',

  aoc_title:                PFX + 'aoc.title',
  aoc_trash:                PFX + 'aoc.trash',
  aoc_notes:                PFX + 'aoc.notes',
  aoc_zero_km:              PFX + 'aoc.zero_km',
  aoc_flagged:              PFX + 'aoc.flagged',
  aoc_restore:              PFX + 'aoc.restore',
  aoc_clear_flag:           PFX + 'aoc.clear_flag',
  aoc_hard_delete_confirm:  PFX + 'aoc.hard_delete_confirm',
  aoc_restore_conf:         PFX + 'aoc.restore_conf',
  aoc_restore_error:        PFX + 'aoc.restore_error',

  as_title:                 '@actionsheet.title',
  save:                     '@save.label',
  cancel:                   '@cancel',
  ok:                       '@ok',
} satisfies Record<string, string>;

export type TripI18n = { [K in keyof typeof TRIP_I18N_KEYS]: Signal<string> };
