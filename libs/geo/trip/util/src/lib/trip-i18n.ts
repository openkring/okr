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
  locked:                   PFX + 'locked',

  // remote read-only mode: the banner shown ON the kiosk, and the admin's toggle in the context menu
  lock_banner:              PFX + 'lock.banner',
  lock_label:               PFX + 'lock.label',
  lock_confirm:             PFX + 'lock.confirm',
  lock_conf:                PFX + 'lock.conf',
  unlock_label:             PFX + 'lock.unlock_label',
  unlock_confirm:           PFX + 'lock.unlock_confirm',
  unlock_conf:              PFX + 'lock.unlock_conf',
  lock_none:                PFX + 'lock.none',
  lock_error:               PFX + 'lock.error',

  create:                   PFX + 'create.label',
  create_conf:              PFX + 'create.conf',
  create_error:             PFX + 'create.error',
  create_guest:             PFX + 'create.guest',

  copy:                     PFX + 'copy.label',

  delete:                   PFX + 'delete.label',
  delete_confirm:           PFX + 'delete.confirm',
  delete_reason:            PFX + 'delete.reason',
  delete_conf:              PFX + 'delete.conf',
  delete_error:             PFX + 'delete.error',

  end:                      PFX + 'end.label',
  view:                     PFX + 'view.label',
  export_raw:               PFX + 'export.raw',

  report_damage:            PFX + 'report.damage.label',
  report_damage_prompt:     PFX + 'report.damage.prompt',

  report_bug:               PFX + 'report.bug.label',
  report_bug_prompt:        PFX + 'report.bug.prompt',

  // the task name is no longer built here — it comes from the workflow rule's messageKey
  report_conf:              PFX + 'report.conf',
  report_error:             PFX + 'report.error',

  report_message_label:     PFX + 'report.message.label',
  report_person_required:   PFX + 'report.person.required',

  report_lock_boat_label:   PFX + 'report.lockBoat.label',
  report_lock_boat_helper:  PFX + 'report.lockBoat.helper',
  report_lock_name:         PFX + 'report.lockBoat.name',
  report_lock_error:        PFX + 'report.lockBoat.error',
  boat_reserved_title:      PFX + 'boatReserved.title',
  boat_reserved_maintenance: PFX + 'boatReserved.maintenance',
  boat_reserved_blocked:    PFX + 'boatReserved.blocked',
  boat_reserved_other:      PFX + 'boatReserved.other',
  boat_reserved_note:       PFX + 'boatReserved.note',
  boat_reserved_until:      PFX + 'boatReserved.until',
  boat_reserved_open_end:   PFX + 'boatReserved.openEnd',
  boat_reserved_confirm:    PFX + 'boatReserved.confirm',

  search:                   PFX + 'search.label',

  info_intro:               PFX + 'info.intro',
  info_before_title:        PFX + 'info.before.title',
  info_before_text:         PFX + 'info.before.text',
  info_why_title:           PFX + 'info.why.title',
  info_why_text:            PFX + 'info.why.text',
  info_reservation_title:   PFX + 'info.reservation.title',
  info_reservation_text:    PFX + 'info.reservation.text',
  info_after_title:         PFX + 'info.after.title',
  info_after_text:          PFX + 'info.after.text',

  call_support:             PFX + 'call.support.label',
  call_support_none:        PFX + 'call.support.none',
  call_support_error:       PFX + 'call.support.error',

  select_participant_title: PFX + 'select.participant.title', 
  select_participant_add:   PFX + 'select.participant.add', 
  select_boat_title:        PFX + 'select.boat.title',
  rigging_title:            PFX + 'rigging.title',
  rigging_scull:            PFX + 'rigging.scull',
  rigging_sweep:            PFX + 'rigging.sweep', 
  select_boat_add:          PFX + 'select.boat.add',
  select_boat_in_use:       PFX + 'select.boat.in_use',
  select_training_add:      PFX + 'select.training.add',
  select_training_title:    PFX + 'select.training.title',
  select_training_option:   PFX + 'select.training.option',
  select_training_none:     PFX + 'select.training.none',
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
  warning_seats_mismatch:   PFX + 'warning.seats_mismatch',
  warning_max_participants: PFX + 'warning.max_participants',
  warning_note:             PFX + 'warning.note',
  warning_track_carrier_missing: PFX + 'warning.track_carrier_missing',
  warning_track_carrier_not_crew: PFX + 'warning.track_carrier_not_crew',

  track_request_label:      PFX + 'track.request.label',
  track_carrier_label:      PFX + 'track.carrier.label',
  track_carrier_helper:     PFX + 'track.carrier.helper',
  // the crew route in the view modal (spec 1.123 §5.2); deadline_date carries a single-brace {date}
  track_route_title:        PFX + 'track.route.title',
  track_gpx_download:       PFX + 'track.gpx.download',
  track_gpx_error:          PFX + 'track.gpx.error',
  track_deadline_date:      PFX + 'track.deadline.date',
  track_deadline_open:      PFX + 'track.deadline.open',
  track_info_title:         PFX + 'track.info.title',
  track_info_what:          PFX + 'track.info.what',
  track_info_where_title:   PFX + 'track.info.where.title',
  track_info_where_ios:     PFX + 'track.info.where.ios',
  track_info_where_android: PFX + 'track.info.where.android',
  track_info_where_computer: PFX + 'track.info.where.computer',
  track_info_use_title:     PFX + 'track.info.use.title',
  track_info_use_text:      PFX + 'track.info.use.text',

  boat:                     PFX + 'boat',
  distance_label:           PFX + 'distance.label',
  distance_placeholder:     PFX + 'distance.placeholder',
  distance_helper:          PFX + 'distance.helper',
  participants:             PFX + 'participants',
  person:                   PFX + 'person',
  notes_label:              PFX + 'notes.label',
  notes_placeholder:        PFX + 'notes.placeholder',
  date:                     PFX + 'date',

  // admin-only date/time editing of a trip
  start_date_label:         PFX + 'start.date_label',
  start_date_placeholder:   PFX + 'start.date_placeholder',
  start_time_label:         PFX + 'start.time_label',
  start_time_placeholder:   PFX + 'start.time_placeholder',
  end_date_label:           PFX + 'end.date_label',
  end_date_placeholder:     PFX + 'end.date_placeholder',
  end_time_label:           PFX + 'end.time_label',
  end_time_placeholder:     PFX + 'end.time_placeholder',

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

  maintenance_title:                PFX + 'maintenance.title',
  maintenance_trash:                PFX + 'maintenance.trash',
  maintenance_notes:                PFX + 'maintenance.notes',
  maintenance_zero_km:              PFX + 'maintenance.zero_km',
  maintenance_flagged:              PFX + 'maintenance.flagged',
  maintenance_restore:              PFX + 'maintenance.restore',
  maintenance_clear_flag:           PFX + 'maintenance.clear_flag',
  maintenance_hard_delete_confirm:  PFX + 'maintenance.hard_delete_confirm',
  maintenance_restore_conf:         PFX + 'maintenance.restore_conf',
  maintenance_restore_error:        PFX + 'maintenance.restore_error',

  // kiosk console (spec 1.101 phase 2: moved from the AOC)
  kiosk_title:                            PFX + 'kiosk.title',
  kiosk_empty:                            PFX + 'kiosk.empty',
  kiosk_no_trips:                         PFX + 'kiosk.no_trips',
  kiosk_lock:                             PFX + 'kiosk.lock',
  kiosk_unlock:                           PFX + 'kiosk.unlock',
  kiosk_reload_conf:                      PFX + 'kiosk.reload.conf',
  kiosk_reload_ask:                       PFX + 'kiosk.reload.ask',
  kiosk_message_sent:                     PFX + 'kiosk.message.sent',
  kiosk_locked_conf:                      PFX + 'kiosk.locked.conf',
  kiosk_unlocked_conf:                    PFX + 'kiosk.unlocked.conf',
  kiosk_no_person:                        PFX + 'kiosk.no_person',
  kiosk_call_failed:                      PFX + 'kiosk.call_failed',
  kiosk_message_title:                    PFX + 'kiosk.message.title',
  kiosk_message_send:                     PFX + 'kiosk.message.send',
  kiosk_message_label:                    PFX + 'kiosk.message.label',
  kiosk_message_placeholder:              PFX + 'kiosk.message.placeholder',
  kiosk_countdown_label:                  PFX + 'kiosk.countdown.label',
  kiosk_countdown_seconds:                PFX + 'kiosk.countdown.seconds',
  kiosk_today_trips:                      PFX + 'kiosk.today_trips',

  as_title:                 '@actionsheet.title',
  save:                     '@save.label',
  cancel:                   '@cancel',
  ok:                       '@ok',
  notify_deleted:           PFX + 'notify.deleted',
  notify_suspicious:        PFX + 'notify.suspicious',
  // 1.107 chat maintenance block
  chat_blocked_title:   PFX + 'chat.blocked.title',
  chat_blocked_default: PFX + 'chat.blocked.default',
  chat_blocked_call:    PFX + 'chat.blocked.call',
} satisfies Record<string, string>;

export type TripI18n = { [K in keyof typeof TRIP_I18N_KEYS]: Signal<string> };
