import { SectionType } from '@okr/shared-models';

/**
 * The property keys the section form edits in journal mode (travel journal, spec 1.154 §2, plan decision 8).
 * The journal's change record carries `title`, `htmlContent` and these properties; the form hides every other
 * property input, so no edit is made that the record would silently drop.
 * - hero: the cover photo, the text overlay and the layout (height, focus); title, subtitle, coordinates and
 *   weather are filled from the footprint at render time (decision 9).
 * - article: the photos, their style and their layout; title and text are not properties.
 * - album: an explicit photo list instead of a folder.
 * - video: an explicit clip list instead of a url.
 * - map (phase 5): zoom, base layer and whether the journal route is drawn; the map is centred on the footprint, so the
 *   centre and «current location» inputs stay hidden.
 * - track (phase 5): the chosen track (`{ trackKey }`, a reference to the journal's `track` entity).
 */
const JOURNAL_MODE_FIELDS: Partial<Record<SectionType, readonly string[]>> = {
  hero: ['hero', 'overlay', 'height', 'focus'],
  article: ['images', 'imageStyle', 'imageLayout'],
  album: ['images'],
  video: ['clips'],
  map: ['zoom', 'layer', 'showRoute'],
  track: ['track'],
};

/** The most clips a journal video section plays (spec 1.154 §10: 1–5); the picker stops there and the video suite enforces it. */
export const JOURNAL_VIDEO_CLIPS_MAX = 5;

/** The property keys the journal form edits for `type`; `[]` for a type the journal does not offer. */
export function journalModeSectionFields(type: SectionType): string[] {
  return [...(JOURNAL_MODE_FIELDS[type] ?? [])];
}

/** Whether the journal form edits property `key` of a section of `type`. */
export function isJournalModeField(type: SectionType, key: string): boolean {
  return (JOURNAL_MODE_FIELDS[type] ?? []).includes(key);
}

/** The zoom range of a journal map (spec 1.154 phase 5): Leaflet levels the journal's base layers can draw. */
export const JOURNAL_MAP_ZOOM_MIN = 1;
export const JOURNAL_MAP_ZOOM_MAX = 19;

/**
 * The ids of the journal's base layers (`BaseLayerOption['id']` in the travel-journal util). The form cannot know which
 * layers a device offers, so it offers all of them; the renderer falls back via `pickBaseLayer` when one is not offered.
 * Kept in sync by hand (this lib must not depend on the journal).
 */
export const JOURNAL_MAP_LAYER_IDS: readonly string[] = [
  'google-roadmap', 'google-satellite', 'swisstopo-live', 'offline-osm', 'offline-satellite', 'offline-swisstopo', 'world',
];
