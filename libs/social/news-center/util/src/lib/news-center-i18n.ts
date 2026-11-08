// libs/social/news-center/util/src/lib/news-center-i18n.ts
import type { Signal } from '@angular/core';

const PFX = '@social/news-center/util.';

/** Keys of the NewsCenter page (feature design 2026-11-08). */
export const NEWS_CENTER_I18N_KEYS = {
  title: PFX + 'title',
  segment_video: PFX + 'segment.video',
  segment_audio: PFX + 'segment.audio',
  segment_text: PFX + 'segment.text',
  segment_webcam: PFX + 'segment.webcam',
  all_channels: PFX + 'all_channels',
  settings: PFX + 'settings',
  my_channels: PFX + 'my_channels',
  club_list: PFX + 'club_list',
  add_channel: PFX + 'add_channel',
  reset_defaults: PFX + 'reset_defaults',
  suggest_channel: PFX + 'suggest_channel',
  your_suggestions: PFX + 'your_suggestions',
  status_open: PFX + 'status.open',
  status_accepted: PFX + 'status.accepted',
  status_rejected: PFX + 'status.rejected',
  default_on: PFX + 'default_on',
  offered_only: PFX + 'offered_only',
  accept: PFX + 'accept',
  reject: PFX + 'reject',
  read_article: PFX + 'read_article',
  open_on_youtube: PFX + 'open_on_youtube',
  image_unavailable: PFX + 'image_unavailable',
  no_feed_found: PFX + 'no_feed_found',
  ip_hint: PFX + 'ip_hint',
  empty: PFX + 'empty',
  empty_channel: PFX + 'empty_channel',
  load_error: PFX + 'load_error',
  suggest_limit: PFX + 'suggest_limit',
  validation_segment: PFX + 'validation.segment',
  validation_url_required: PFX + 'validation.urlRequired',
  validation_url_invalid: PFX + 'validation.urlInvalid',
  validation_note_too_long: PFX + 'validation.noteTooLong',
} satisfies Record<string, string>;

export type NewsCenterI18n = { [K in keyof typeof NEWS_CENTER_I18N_KEYS]: Signal<string> };
