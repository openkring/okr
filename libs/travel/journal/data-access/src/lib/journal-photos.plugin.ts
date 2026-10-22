import { registerPlugin } from '@capacitor/core';

/**
 * Native photo import for the travel journal (spec 1.113 §6.1), implemented in Swift in the bkg iOS
 * project (`ios/App/App/JournalPhotosPlugin.swift`). Reads capture time and GPS from the
 * photo's EXIF data via PhotoKit and writes a 2048 px and a 400 px JPEG into the app's Documents
 * directory. Paths are RELATIVE to Documents (the container path changes on every app update).
 * Photos that could not be imported come back in `skipped`, never silently dropped.
 */
export interface PickedPhoto {
  localIdentifier: string;
  takenAt?: string; // local wall clock 'yyyy-MM-ddTHH:mm:ss' from EXIF DateTimeOriginal; absent when the photo has no date at all
  utcOffset?: string; // EXIF OffsetTimeOriginal, e.g. '-03:00', when present
  latitude?: number; // undefined when missing or 0/0
  longitude?: number;
  width: number;
  height: number;
  path2048: string; // relative to Documents: 'journals/<journalKey>/<uuid>-2048.jpg'
  path400: string;
}

/** notOnDevice: the original is only in iCloud; notAccessible: outside a limited photo-library selection. */
export type PhotoSkipReason = 'notOnDevice' | 'notAccessible' | 'noAssetIdentifier' | 'unreadable' | 'writeFailed';

export interface SkippedPhoto {
  localIdentifier: string;
  reason: PhotoSkipReason;
}

export interface JournalPhotosPlugin {
  pick(options: { journalKey: string; limit?: number }): Promise<{ photos: PickedPhoto[]; skipped: SkippedPhoto[] }>;
}

export const JournalPhotos = registerPlugin<JournalPhotosPlugin>('JournalPhotos');
