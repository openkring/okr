import { signal, type Signal } from '@angular/core';

import type { DiaryI18n } from '@okr/content-diary-util';
import { TRACKER_I18N_KEYS, type TrackerI18n } from '@okr/mobility-tracker-util';

const EMPTY: Signal<string> = signal('').asReadonly();

/**
 * The tracker's read-only components (okr-track-sections / okr-track-photos with `readonly`) as used by the diary
 * track view take a `TrackerI18n`. The diary builds one from its own scope so that no diary app has to ship the
 * tracker's i18n scope (spec 1.121 §7): the modes and the few labels a read-only view shows come from the diary
 * keys, every other label (corrections, hide / show) is never rendered there and stays empty.
 */
export function diaryTrackerI18n(i18n: DiaryI18n): TrackerI18n {
  const fromDiary: Partial<TrackerI18n> = {
    mode_plane: i18n.track_mode_plane,
    mode_ship: i18n.track_mode_ship,
    mode_bus: i18n.track_mode_bus,
    mode_train: i18n.track_mode_train,
    mode_car: i18n.track_mode_car,
    mode_bike: i18n.track_mode_bike,
    mode_foot: i18n.track_mode_foot,
    mode_row: i18n.track_mode_row,
    mode_ski: i18n.track_mode_ski,
    mode_motorbike: i18n.track_mode_motorbike,
    photos_title: i18n.track_photos,
    photos_hidden: i18n.track_hidden,
    detail_sections: i18n.track_sections,
    section_detected: i18n.track_detected,
  };
  const keys = Object.keys(TRACKER_I18N_KEYS) as (keyof TrackerI18n)[];
  return Object.fromEntries(keys.map(k => [k, fromDiary[k] ?? EMPTY])) as TrackerI18n;
}
