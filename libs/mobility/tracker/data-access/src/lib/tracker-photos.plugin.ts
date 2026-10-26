import { registerPlugin } from '@capacitor/core';
import type { LibraryPhoto } from '@okr/mobility-tracker-util';

/**
 * Own native photo-library reader for tracks (tracker plan 3, spec §6), implemented in Swift in the bkg iOS
 * project (`ios/App/App/TrackerPhotosPlugin.swift`). `between` writes a downscaled JPEG per photo into the
 * app cache and returns its absolute path (`path400`); use Capacitor.convertFileSrc / Filesystem.readFile on it.
 */
export type PhotoAccess = 'full' | 'limited' | 'denied' | 'notDetermined';

export interface TrackerPhotosPlugin {
  access(): Promise<{ access: PhotoAccess }>;
  /** Resolves after the user answered the system dialog. */
  requestAccess(): Promise<{ access: PhotoAccess }>;
  /** from/to: ms epoch. At most 200 photos per call; the rest and unloadable ones are counted in `skipped`. */
  between(o: { from: number; to: number; maxPx: number }): Promise<{ photos: LibraryPhoto[]; access: PhotoAccess; skipped: number }>;
}

export const TrackerPhotos = registerPlugin<TrackerPhotosPlugin>('TrackerPhotos');
