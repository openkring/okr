import { SectionType } from '@okr/shared-models';

/**
 * The property keys the section form edits in journal mode (travel journal, spec 1.154 §2, plan decision 8).
 * The journal's change record carries `title`, `htmlContent` and these properties; the form hides every other
 * property input, so no edit is made that the record would silently drop.
 * - hero: the cover photo, the text overlay and the layout (height, focus); title, subtitle, coordinates and
 *   weather are filled from the footprint at render time (decision 9).
 * - article: the photos and their style; title and text are not properties.
 * - album: an explicit photo list instead of a folder.
 * - video: an explicit clip list instead of a url.
 */
const JOURNAL_MODE_FIELDS: Partial<Record<SectionType, readonly string[]>> = {
  hero: ['hero', 'overlay', 'height', 'focus'],
  article: ['images', 'imageStyle'],
  album: ['images'],
  video: ['clips'],
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
