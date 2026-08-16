import { Signal } from '@angular/core';

const PFX = '@content/meeting/feature.';

export const MEETING_I18N_KEYS = {
  plural:                          PFX + 'plural',
  empty:                           PFX + 'empty',
  as_title:                        '@actionsheet.title',
  cancel:                          '@cancel',

  create_label:                    PFX + 'operation.create.label',
  edit_label:                      PFX + 'operation.edit.label',
  view_label:                      PFX + 'operation.view.label',
  delete_confirm:                  PFX + 'operation.delete.confirm',

  as_edit:                         PFX + 'actionsheet.edit',
  as_minutes:                      PFX + 'actionsheet.minutes',
  as_pdf:                          PFX + 'actionsheet.pdf',
  as_send:                         PFX + 'actionsheet.send',
  send_noPdf:                      PFX + 'send.noPdf',
  as_approve:                      PFX + 'actionsheet.approve',
  as_delete:                       PFX + 'actionsheet.delete',
  approve_noSignees:               PFX + 'approve.noSignees',
  approve_started:                 PFX + 'approve.started',

  changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',

  // form fields
  name_label:                      PFX + 'name.label',
  name_placeholder:                PFX + 'name.placeholder',
  name_helper:                     PFX + 'name.helper',
  meetingDate_label:               PFX + 'meetingDate.label',
  meetingDate_placeholder:         PFX + 'meetingDate.placeholder',
  startTime_label:                 PFX + 'startTime.label',
  startTime_placeholder:           PFX + 'startTime.placeholder',
  groupKey_label:                  PFX + 'groupKey.label',
  groupKey_placeholder:            PFX + 'groupKey.placeholder',
  groupKey_helper:                 PFX + 'groupKey.helper',
  locationKey_label:               PFX + 'locationKey.label',
  locationKey_placeholder:         PFX + 'locationKey.placeholder',
  state_label:                     PFX + 'state.label',
  notes_label:                     PFX + 'notes.label',
  notes_placeholder:               PFX + 'notes.placeholder',

  // agenda editor
  agenda_title:                    PFX + 'agenda.title',
  agenda_empty:                    PFX + 'agenda.empty',
  agenda_add:                      PFX + 'agenda.add',
  agenda_item_placeholder:         PFX + 'agenda.item.placeholder',
  agenda_kind_info:                PFX + 'agenda.kind.info',
  agenda_kind_discussion:          PFX + 'agenda.kind.discussion',
  agenda_kind_decision:            PFX + 'agenda.kind.decision',
  agenda_timeBox:                  PFX + 'agenda.timeBox',
  agenda_carried:                  PFX + 'agenda.carried',
  agenda_minutes_label:            PFX + 'agenda.minutes.label',
  agenda_minutes_placeholder:      PFX + 'agenda.minutes.placeholder',
  agenda_decision_label:           PFX + 'agenda.decision.label',
  agenda_decision_placeholder:     PFX + 'agenda.decision.placeholder',
  agenda_addTask:                  PFX + 'agenda.addTask',

  // attendees
  attendees_title:                 PFX + 'attendees.title',
  attendees_empty:                 PFX + 'attendees.empty',
  attendees_present:               PFX + 'attendees.state.present',
  attendees_excused:               PFX + 'attendees.state.excused',
  attendees_absent:                PFX + 'attendees.state.absent',
  attendees_invited:               PFX + 'attendees.state.invited',
  attendees_presentCount:          PFX + 'attendees.presentCount',

  // minutes PDF
  pdf_title:                       PFX + 'pdf.title',
  pdf_generated:                   PFX + 'pdf.generated',
  pdf_signatures:                  PFX + 'pdf.signatures',
} satisfies Record<string, string>;

export type MeetingI18n = { [K in keyof typeof MEETING_I18N_KEYS]: Signal<string> };
