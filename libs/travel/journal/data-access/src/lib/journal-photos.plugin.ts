import { registerPlugin } from '@capacitor/core';

/**
 * Native photo import for the travel journal (spec 1.113 §6.1), implemented in Swift in the bkg iOS
 * project (`ios/App/App/Plugins/JournalPhotosPlugin.swift`). Reads capture time and GPS from the
 * photo's EXIF data via PhotoKit and writes a 2048 px and a 400 px JPEG into the app's Documents
 * directory.
 */
export interface PickedPhoto {
  localIdentifier: string;
  takenAt: string; // local wall clock 'yyyy-MM-ddTHH:mm:ss' from EXIF DateTimeOriginal
  utcOffset?: string; // EXIF OffsetTimeOriginal, e.g. '-03:00', when present
  latitude?: number; // undefined when missing or 0/0
  longitude?: number;
  width: number;
  height: number;
  path2048: string; // file path in Documents/journals/<journalKey>/
  path400: string;
}

export interface JournalPhotosPlugin {
  pick(options: { journalKey: string; limit?: number }): Promise<{ photos: PickedPhoto[] }>;
}

export const JournalPhotos = registerPlugin<JournalPhotosPlugin>('JournalPhotos');
