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
  /** Plan 4: PUT of Documents/journals/<journalKey>/<file> to a signed URL (URLSession, not the WebView). */
  uploadFile(options: { journalKey: string; file: string; url: string; headers: Record<string, string> }): Promise<{ status: number }>;
  /** Plan 4: GET from a signed URL into Documents/journals/<journalKey>/<file>. */
  downloadFile(options: { journalKey: string; file: string; url: string }): Promise<{ status: number }>;
  /** Plan 4: the named files that exist in Documents/journals/<journalKey>/. */
  presentFiles(options: { journalKey: string; files: string[] }): Promise<{ files: string[] }>;
  /**
   * Plan 6: one offline map tile into Documents/<path> (`tiles/gibs/z/x/y.jpg`, `tiles/lima/z/x/y.png`,
   * `tiles/swisstopo/z/x/y.jpeg`); existing tiles (and markers) are skipped. Phase 4 §5: a source answering 404 or 204
   * gets a zero-byte marker and resolves `{ empty: true }`; every other failure rejects. Older plugins never set `empty`.
   */
  downloadTile(options: { url: string; path: string }): Promise<{ skipped: boolean; empty?: true }>;
  /**
   * Plan 6b: stores an OpenStreetMap vector tile (`tiles/osm/z/x/y.mvt`, base64, at most 2 MB). Phase 4 §5: `data: ''`
   * writes a zero-byte marker and is accepted for every tile pattern (older plugins reject it for raster paths).
   */
  writeTile(options: { path: string; data: string }): Promise<void>;
  /** Plan 6b: one HTTP range of the Protomaps build (or its build list), base64 — those hosts send no CORS headers. */
  fetchRange(options: { url: string; offset: number; length: number }): Promise<{ data: string }>;
  /** Plan 6b: the named tile paths that are already stored. */
  presentTiles(options: { paths: string[] }): Promise<{ paths: string[] }>;
  /**
   * Book export: the original of `localIdentifier` (iCloud allowed) as a print JPEG in Documents/journals/<journalKey>/<file>,
   * scaled by min(1, max(fillLongPx / long, fillShortPx / short)) — never enlarged —, sRGB, JPEG 0.92. Resolves with the pixel
   * size, or with `skipped` (notAccessible / notOnDevice / unreadable / writeFailed) when the photo is not in this iPad's library.
   */
  exportOriginal(options: { journalKey: string; localIdentifier: string; file: string; fillLongPx: number; fillShortPx: number }):
    Promise<{ width: number; height: number } | { skipped: PhotoSkipReason }>;
  /** Book export: removes Documents/journals/<journalKey>/<file> (the print file after its upload); a missing file is fine. */
  deleteFile(options: { journalKey: string; file: string }): Promise<void>;
  /** Plan 8: deletes the named tiles («Speicher freigeben»). */
  deleteTiles(options: { paths: string[] }): Promise<{ deleted: number }>;
  /**
   * Phase 4 §5: how many of the named tiles are stored and their total size in bytes. At most 500 paths per call (the
   * caller chunks); paths outside the tile patterns are ignored; a zero-byte marker counts as present with 0 bytes.
   * Missing on older plugins (the call rejects as unimplemented → «unknown size»).
   */
  tileStats(options: { paths: string[] }): Promise<{ present: number; bytes: number }>;
}

export const JournalPhotos = registerPlugin<JournalPhotosPlugin>('JournalPhotos');
