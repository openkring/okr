import { Signal } from '@angular/core';

import type { TransportMode } from '@okr/shared-models';
import { fill } from '@okr/shared-util-core';

import type { BookLabels } from './journal-book.util';

/**
 * Translation keys of the book page (book export, spec 1.113 phase 2), in the journal feature's scope under `book`.
 * `label_*` are the words printed in the book (ruling R3: resolved here, sent to the function with the export).
 * Placeholders use single braces and `fill()` (translateAll drops double-brace params).
 */
const PFX = '@travel/journal/feature.book.';

export const BOOK_I18N_KEYS = {
  button: PFX + 'button',
  title: PFX + 'title',
  settings: PFX + 'settings',
  loading: PFX + 'loading',
  pages: PFX + 'pages',
  pages_max: PFX + 'pages_max',
  page: PFX + 'page',
  warnings: PFX + 'warnings',
  warnings_none: PFX + 'warnings_none',
  warning_missing: PFX + 'warning_missing',
  warning_poor: PFX + 'warning_poor',
  warning_very_poor: PFX + 'warning_very_poor',
  prints_missing: PFX + 'prints_missing',
  prints_missing_unknown: PFX + 'prints_missing_unknown',
  prints_hint: PFX + 'prints_hint',
  editor_hint: PFX + 'editor_hint',
  editor_auto: PFX + 'editor_auto',
  template: PFX + 'template',
  template_full: PFX + 'template_full',
  template_two_portrait: PFX + 'template_two_portrait',
  template_two_landscape: PFX + 'template_two_landscape',
  template_hero_2: PFX + 'template_hero_2',
  template_hero_3: PFX + 'template_hero_3',
  photos: PFX + 'photos',
  move: PFX + 'move',
  move_title: PFX + 'move_title',
  hide: PFX + 'hide',
  show: PFX + 'show',
  whole: PFX + 'whole',
  fill: PFX + 'fill',
  hidden_title: PFX + 'hidden_title',
  reset: PFX + 'reset',
  reset_hint: PFX + 'reset_hint',
  comments_switch: PFX + 'comments_switch',
  comments_empty: PFX + 'comments_empty',
  map: PFX + 'map',
  save_failed: PFX + 'save_failed',
  export_title: PFX + 'export_title',
  export_print: PFX + 'export_print',
  export_screen: PFX + 'export_screen',
  export_preparing: PFX + 'export_preparing',
  export_maps: PFX + 'export_maps',
  export_running: PFX + 'export_running',
  export_done: PFX + 'export_done',
  export_book: PFX + 'export_book',
  export_cover: PFX + 'export_cover',
  export_links_hint: PFX + 'export_links_hint',
  export_failed: PFX + 'export_failed',
  export_busy: PFX + 'export_busy',
  export_maps_incomplete: PFX + 'export_maps_incomplete',
  export_maps_failed: PFX + 'export_maps_failed',
  export_last: PFX + 'export_last',
  export_screen_hint: PFX + 'export_screen_hint',
  settings_title: PFX + 'settings_title',
  settings_title_label: PFX + 'settings_title_label',
  settings_title_ph: PFX + 'settings_title_ph',
  settings_title_helper: PFX + 'settings_title_helper',
  settings_subtitle_label: PFX + 'settings_subtitle_label',
  settings_subtitle_ph: PFX + 'settings_subtitle_ph',
  settings_subtitle_helper: PFX + 'settings_subtitle_helper',
  settings_cover_photo: PFX + 'settings_cover_photo',
  settings_cover_photo_auto: PFX + 'settings_cover_photo_auto',
  settings_print: PFX + 'settings_print',
  settings_bleed_label: PFX + 'settings_bleed_label',
  settings_bleed_helper: PFX + 'settings_bleed_helper',
  settings_multiple_label: PFX + 'settings_multiple_label',
  settings_multiple_helper: PFX + 'settings_multiple_helper',
  settings_cover_label: PFX + 'settings_cover_label',
  settings_cover_helper: PFX + 'settings_cover_helper',
  settings_cover_none: PFX + 'settings_cover_none',
  settings_cover_softcover: PFX + 'settings_cover_softcover',
  settings_cover_hardcover: PFX + 'settings_cover_hardcover',
  settings_spine_label: PFX + 'settings_spine_label',
  settings_spine_helper: PFX + 'settings_spine_helper',
  settings_wrap_label: PFX + 'settings_wrap_label',
  settings_wrap_helper: PFX + 'settings_wrap_helper',
  label_day: PFX + 'label.day',
  label_stretch: PFX + 'label.stretch',
  label_cumulative: PFX + 'label.cumulative',
  label_km: PFX + 'label.km',
  label_photos: PFX + 'label.photos',
  label_weather: PFX + 'label.weather',
  label_transport_via: PFX + 'label.transport_via',
  label_no_transport: PFX + 'label.no_transport',
  label_north: PFX + 'label.north',
  label_south: PFX + 'label.south',
  label_east: PFX + 'label.east',
  label_west: PFX + 'label.west',
  label_comments: PFX + 'label.comments',
  label_stats_title: PFX + 'label.stats_title',
  label_days: PFX + 'label.days',
  label_footprints: PFX + 'label.footprints',
  label_total_km: PFX + 'label.total_km',
  label_southernmost: PFX + 'label.southernmost',
  label_northernmost: PFX + 'label.northernmost',
  label_page: PFX + 'label.page',
  label_credit: PFX + 'label.credit',
  label_colophon: PFX + 'label.colophon',
} satisfies Record<string, string>;

export type JournalBookI18n = { [K in keyof typeof BOOK_I18N_KEYS]: Signal<string> };

/** The callable accepts at most this many characters per label. */
export const BOOK_LABEL_MAX = 200;

const clip = (s: string): string => (s.length > BOOK_LABEL_MAX ? s.slice(0, BOOK_LABEL_MAX - 1) + '…' : s);

/**
 * The printed words of the book (BookLabels) from the resolved signals. `transport` are the journal's transport names;
 * `sources` the imagery credits of the map layers (HTML tags removed, duplicates dropped) — no sources, no credit line.
 */
export function bookLabelsOf(i18n: JournalBookI18n, transport: Record<TransportMode, string>, sources: string[]): BookLabels {
  const credits = [...new Set(sources.map((s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()).filter((s) => s))];
  const labels: BookLabels = {
    day: i18n.label_day(),
    stretch: i18n.label_stretch(),
    cumulative: i18n.label_cumulative(),
    km: i18n.label_km(),
    photos: i18n.label_photos(),
    weather: i18n.label_weather(),
    transportVia: i18n.label_transport_via(),
    noTransport: i18n.label_no_transport(),
    transport: { ...transport },
    north: i18n.label_north(),
    south: i18n.label_south(),
    east: i18n.label_east(),
    west: i18n.label_west(),
    comments: i18n.label_comments(),
    statsTitle: i18n.label_stats_title(),
    days: i18n.label_days(),
    footprints: i18n.label_footprints(),
    totalKm: i18n.label_total_km(),
    southernmost: i18n.label_southernmost(),
    northernmost: i18n.label_northernmost(),
    page: i18n.label_page(),
    credit: credits.length > 0 ? fill(i18n.label_credit(), { sources: credits.join(' · ') }) : '',
    colophon: i18n.label_colophon(),
  };
  const out = { ...labels, transport: {} as Record<TransportMode, string> };
  for (const [k, v] of Object.entries(labels)) if (typeof v === 'string') (out as unknown as Record<string, string>)[k] = clip(v);
  for (const [k, v] of Object.entries(labels.transport)) out.transport[k as TransportMode] = clip(v);
  return out;
}
