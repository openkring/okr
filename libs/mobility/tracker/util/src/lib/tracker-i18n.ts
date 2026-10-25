import type { Signal } from '@angular/core';

/** Translation keys of the tracker (spec 1.121); the scope mirrors libs/mobility/tracker/feature. */
const PFX = '@mobility/tracker/feature.';

export const TRACKER_I18N_KEYS = {
  mode_plane: PFX + 'mode.plane',
  mode_ship: PFX + 'mode.ship',
  mode_bus: PFX + 'mode.bus',
  mode_train: PFX + 'mode.train',
  mode_car: PFX + 'mode.car',
  mode_bike: PFX + 'mode.bike',
  mode_foot: PFX + 'mode.foot',
  mode_row: PFX + 'mode.row',
  mode_ski: PFX + 'mode.ski',
  mode_motorbike: PFX + 'mode.motorbike',
  default_name: PFX + 'default_name',
  warning_whenInUseOnly: PFX + 'warning.whenInUseOnly',
  warning_locationDenied: PFX + 'warning.locationDenied',
  warning_motionDenied: PFX + 'warning.motionDenied',
  warning_notNative: PFX + 'warning.notNative',
  upload_error: PFX + 'upload_error',
  start_title: PFX + 'start.title',
  start_detect: PFX + 'start.detect',
  start_start: PFX + 'start.start',
  recording_pause: PFX + 'recording.pause',
  recording_resume: PFX + 'recording.resume',
  recording_stop: PFX + 'recording.stop',
  recording_distance: PFX + 'recording.distance',
  recording_points: PFX + 'recording.points',
  resume_title: PFX + 'resume.title',
  resume_continue: PFX + 'resume.continue',
  resume_finish: PFX + 'resume.finish',
  proposal_text: PFX + 'proposal.text', // single braces: {mode} — translateAll strips {{…}}
  proposal_accept: PFX + 'proposal.accept',
  proposal_dismiss: PFX + 'proposal.dismiss',
  list_title: PFX + 'list.title',
  list_empty: PFX + 'list.empty',
  list_not_uploaded: PFX + 'list.not_uploaded',
  list_retry_upload: PFX + 'list.retry_upload',
  list_rename: PFX + 'list.rename',
  list_rename_prompt: PFX + 'list.rename_prompt',
  list_delete: PFX + 'list.delete',
  list_delete_confirm: PFX + 'list.delete_confirm',
  list_share_gpx: PFX + 'list.share_gpx',
  section_change_mode: PFX + 'section.change_mode',
  section_split: PFX + 'section.split',
  section_merge: PFX + 'section.merge',
} satisfies Record<string, string>;

export type TrackerI18n = { [K in keyof typeof TRACKER_I18N_KEYS]: Signal<string> };
