import { InjectionToken } from '@angular/core';

/**
 * Where the section form of a journal track section gets its track from (travel journal, spec 1.154 phase 5).
 * The travel journal provides one over the author's tracker tracks (online) and the tracks the journal already holds
 * (offline). The CMS knows no tracks, so it has no root default: without a provider the track form hides «Strecke
 * wählen» and says so. Inject it with `{ optional: true }`.
 */
export interface SectionTrackPicker {
  /**
   * Lets the user choose a track; `current` is the track now chosen (so the picker can mark it). Resolves to
   * `undefined` when nothing was chosen. The picker makes sure the journal holds the chosen track before it resolves.
   */
  pick(current?: string): Promise<{ trackKey: string; label: string } | undefined>;
  /** The summary line of a track the journal holds (name, day, distance); `undefined` when it is not known (yet). */
  label(trackKey: string): string | undefined;
}

export const SECTION_TRACK_PICKER = new InjectionToken<SectionTrackPicker>('SectionTrackPicker');
