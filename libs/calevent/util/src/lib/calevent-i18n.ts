import { Signal } from '@angular/core';

const PFX = '@calevent/feature.';

export const CALEVENT_I18N_KEYS = {
  calevent:                   PFX + 'calevent',
  calevents:                  PFX + 'calevents',
  empty:                      PFX + 'empty',

  attendance_accepted:        PFX + 'attendance.accepted',
  attendance_attendees:       PFX + 'attendance.attendees',
  attendance_helper:          PFX + 'attendance.helper',
  attendance_add:             PFX + 'attendance.add',
  attendance_exists:          PFX + 'attendance.exists',
  attendance_empty:           PFX + 'attendance.empty',

  create:                     PFX + 'create.label',
  create_conf:                PFX + 'create.conf',
  create_error:               PFX + 'create.error',

  delete:                     PFX + 'delete.label',
  delete_confirm:             PFX + 'delete.confirm',
  delete_conf:                PFX + 'delete.conf',
  delete_error:               PFX + 'delete.error',
  delete_series_label:        PFX + 'delete.series.label',
  delete_series_confirm:      PFX + 'delete.series.confirm',
  delete_series_conf:         PFX + 'delete.series.conf',
  delete_series_error:        PFX + 'delete.series.error',
  delete_series_intro:        PFX + 'delete.series.intro',
  delete_series_current:      PFX + 'delete.series.current',
  delete_series_future:       PFX + 'delete.series.future',
  delete_series_all:          PFX + 'delete.series.all',

  download_ics:               PFX + 'download.ics',

  quick_entry_label:          PFX + 'quickEntry.label',
  quick_entry_placeholder:    PFX + 'quickEntry.placeholder',

  schedule_title:             PFX + 'schedule.title',
  schedule_find:              PFX + 'schedule.find',
  schedule_close:             PFX + 'schedule.close.label',
  schedule_close_message:     PFX + 'schedule.close.message',
  schedule_optional_message:  PFX + 'schedule.optionalMessage',
  schedule_date_proposals:    PFX + 'schedule.date.proposals',
  schedule_date_add:          PFX + 'schedule.date.add',
  schedule_date_confirm:      PFX + 'schedule.date.confirm',
  schedule_view:              PFX + 'schedule.view',

  update:                     PFX + 'update.label',
  update_conf:                PFX + 'update.conf',
  update_error:               PFX + 'update.error',
  update_series_label:        PFX + 'update.series.label',
  update_series_conf:         PFX + 'update.series.conf',
  update_series_error:        PFX + 'update.series.error',
  update_series_intro:        PFX + 'update.series.intro',
  update_series_current:      PFX + 'update.series.current',
  update_series_future:       PFX + 'update.series.future',
  update_series_all:          PFX + 'update.series.all',

  view:                       PFX + 'view.label',
  view_album:                 PFX + 'view.album',

  invite_person:              PFX + 'invite.person.label',
  invite_person_conf:         PFX + 'invite.person.conf',
  invite_person_error:        PFX + 'invite.person.error',
  invite_members:             PFX + 'invite.members.label',
  invite_members_conf:        PFX + 'invite.members.conf',
  invite_members_error:       PFX + 'invite.members.error',

  invitation_pending:         PFX + 'invitation.pending',
  invitation_update:          PFX + 'invitation.update.label',
  invitation_update_conf:     PFX + 'invitation.update.conf',
  invitation_update_error:    PFX + 'invitation.update.error',
  invitation_subscribe:       PFX + 'invitation.subscribe',
  invitation_unsubscribe:     PFX + 'invitation.unsubscribe',

  wda_monday:                 PFX + 'weekday.abbreviation.monday',
  wda_tuesday:                PFX + 'weekday.abbreviation.tuesday',
  wda_wednesday:              PFX + 'weekday.abbreviation.wednesday',
  wda_thursday:               PFX + 'weekday.abbreviation.thursday',
  wda_friday:                 PFX + 'weekday.abbreviation.friday',
  wda_saturday:               PFX + 'weekday.abbreviation.saturday',
  wda_sunday:                 PFX + 'weekday.abbreviation.sunday',

  wdn_monday:                 PFX + 'weekday.name.monday',
  wdn_tuesday:                PFX + 'weekday.name.tuesday',
  wdn_wednesday:              PFX + 'weekday.name.wednesday',
  wdn_thursday:               PFX + 'weekday.name.thursday',
  wdn_friday:                 PFX + 'weekday.name.friday',
  wdn_saturday:               PFX + 'weekday.name.saturday',
  wdn_sunday:                 PFX + 'weekday.name.sunday',

  january:                    PFX + 'month.january',
  february:                   PFX + 'month.february',
  march:                      PFX + 'month.march',
  april:                      PFX + 'month.april',
  may:                        PFX + 'month.may',
  june:                       PFX + 'month.june',
  july:                       PFX + 'month.july',
  august:                     PFX + 'month.august',
  september:                  PFX + 'month.september',
  october:                    PFX + 'month.october',
  november:                   PFX + 'month.november',
  december:                   PFX + 'month.december',

  periodicity_name:                 PFX + 'periodicity.name',
  periodicity_once:                 PFX + 'periodicity.once.label',
  periodicity_once_description:     PFX + 'periodicity.once.description',
  periodicity_daily:                PFX + 'periodicity.daily.label',
  periodicity_daily_description:    PFX + 'periodicity.daily.description',
  periodicity_workday:              PFX + 'periodicity.workday.label',
  periodicity_workday_description:  PFX + 'periodicity.workday.description',
  periodicity_weekly:               PFX + 'periodicity.weekly.label',
  periodicity_weekly_description:   PFX + 'periodicity.weekly.description',
  periodicity_biweekly:             PFX + 'periodicity.biweekly.label',
  periodicity_biweekly_description: PFX + 'periodicity.biweekly.description',
  periodicity_monthly:              PFX + 'periodicity.monthly.label',
  periodicity_monthly_description:  PFX + 'periodicity.monthly.description',
  periodicity_quarterly:            PFX + 'periodicity.quarterly.label',
  periodicity_quarterly_description: PFX + 'periodicity.quarterly.description',
  periodicity_yearly:               PFX + 'periodicity.yearly.label',
  periodicity_yearly_description:   PFX + 'periodicity.yearly.description',

  list_header_name:               PFX + 'list.header.name',
  list_header_duration:           PFX + 'list.header.duration',
  list_header_year:               PFX + 'list.header.year',
  list_header_responsible:        PFX + 'list.header.responsible',
  list_header_location:           PFX + 'list.header.location',
  list_header_description:        PFX + 'list.header.description',

  as_title:                       '@actionsheet.title',
  ok:                             '@ok',
  cancel:                         '@cancel',
  save:                           '@save.label',
  event:                          '@event',
  year:                           '@year',
  location:                       '@location',
  topic:                          '@topic',
  date:                           '@date',
  url:                            '@url',

  bkey_label:                     PFX + 'bkey.label',
  bkey_placeholder:               PFX + 'bkey.placeholder',
  bkey_helper:                    PFX + 'bkey.helper',

  calendar_title:                 PFX + 'calendar.title',
  calendar_add:                   PFX + 'calendar.add',
  calendar_select:                PFX + 'calendar.select',

  date_end:                       PFX + 'date.end.label',
  date_end_placeholder:           PFX + 'date.end.placeholder',
  date_end_helper:                PFX + 'date.end.helper',
  date_start:                     PFX + 'date.start.label',
  date_start_placeholder:         PFX + 'date.start.placeholder',
  date_start_helper:              PFX + 'date.start.helper',
  date_repeatUntil_label:         PFX + 'date.repeatUntil.label',
  date_repeatUntil_placeholder:   PFX + 'date.repeatUntil.placeholder',
  date_repeatUntil_helper:        PFX + 'date.repeatUntil.helper',

  description:                    PFX + 'description.label',
  description_placeholder:        PFX + 'description.placeholder',

  durationMinutes:                PFX + 'durationMinutes.label',
  durationMinutes_placeholder:    PFX + 'durationMinutes.placeholder',
  durationMinutes_helper:         PFX + 'durationMinutes.helper',

  fullDay_label:                  PFX + 'fullDay.label',
  fullDay_helper:                 PFX + 'fullDay.helper',

  locationKey_label:              PFX + 'locationKey.label',
  locationKey_placeholder:        PFX + 'locationKey.placeholder',
  locationKey_helper:             PFX + 'locationKey.helper',

  name_label:                     PFX + 'name.label',
  name_placeholder:               PFX + 'name.placeholder',
  name_helper:                    PFX + 'name.helper',

  responsible:                    PFX + 'responsible.label',
  responsible_add:                PFX + 'responsible.add',
  responsible_persons:            PFX + 'responsible.persons',
  responsible_description:        PFX + 'responsible.description',

  seriesId_label:                 PFX + 'seriesId.label',
  seriesId_placeholder:           PFX + 'seriesId.placeholder',
  seriesId_helper:                PFX + 'seriesId.helper',

  startTime_label:                PFX + 'startTime.label',
  startTime_placeholder:          PFX + 'startTime.placeholder',

  // calevent_type: explicit

} satisfies Record<string, string>;

export type CaleventI18n = { [K in keyof typeof CALEVENT_I18N_KEYS]: Signal<string> };
