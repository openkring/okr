import { FootprintView, ImageView } from './journal-view.util';

/**
 * The rules of the Firebase sync (spec 1.113 §5.3, plan 4), kept pure so they are tested here and the
 * JournalSyncService only moves data.
 */
export const UPLOAD_PAGE = 200;
export const DOWNLOAD_PAGE = 500;
/** Downloads start this far before the cursor: a record committed a moment earlier may become visible later. */
export const CURSOR_OVERLAP_MS = 60_000;

/**
 * How photo files move through Firebase: 'all' = up and down; 'uploadOnly' = publish own photos, never
 * download (on board: the other iPad's photos come over the local network, plan 5); 'paused' = neither.
 * Text records always sync.
 */
export type JournalPhotoMode = 'all' | 'uploadOnly' | 'paused';
export const JOURNAL_PHOTO_MODES: JournalPhotoMode[] = ['all', 'uploadOnly', 'paused'];

/** The stored mode; a device from before the three modes kept only `photosPaused = '1'`. */
export function parsePhotoMode(stored: string | undefined, legacyPaused: string | undefined): JournalPhotoMode {
  if (stored === 'all' || stored === 'uploadOnly' || stored === 'paused') return stored;
  return legacyPaused === '1' ? 'paused' : 'all';
}

export function pagesOf<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

export function downloadStart(cursorMs: number | undefined): number {
  return cursorMs === undefined ? 0 : Math.max(0, cursorMs - CURSOR_OVERLAP_MS);
}

/** The cursor moves only past records that are stored, and never back. */
export function advanceCursor(cursorMs: number | undefined, storedUploadTimes: number[]): number | undefined {
  const max = storedUploadTimes.reduce((m, t) => Math.max(m, t), cursorMs ?? 0);
  return max === 0 ? cursorMs : max;
}

/**
 * What a failed record upload means. A record is only ever created, so `permission-denied` on a record
 * that already exists is a retry after a lost response: it counts as uploaded. Denied on a missing record
 * means «not (yet) allowed» — the journal is not materialised or the person is no author: stop this journal
 * for this round. Anything else (offline, quota) is retried in the next round.
 */
export type UploadOutcome = 'uploaded' | 'stop' | 'retry';

export function classifyUploadError(code: string | undefined, existsOnServer: boolean): UploadOutcome {
  if (existsOnServer) return 'uploaded';
  return code === 'permission-denied' ? 'stop' : 'retry';
}

/** The file name of a device path (`journals/<jk>/<uuid>-400.jpg` → `<uuid>-400.jpg`). */
export function photoFileName(path: string): string {
  return path.split('/').pop() ?? '';
}

/**
 * Photo files that go to Firebase (spec §5.3): both sizes of every image shown in a published
 * footprint. Drafts and originals stay on the device.
 */
export function publishedPhotoFiles(footprints: FootprintView[], images: Map<string, ImageView>): string[] {
  const files = new Set<string>();
  for (const footprint of footprints) {
    if (footprint.publishState !== 'published') continue;
    for (const block of footprint.blocks) {
      for (const key of block.imageKeys ?? []) {
        const image = images.get(key);
        if (!image) continue;
        for (const path of [image.path2048, image.path400]) {
          const file = photoFileName(path);
          if (file !== '') files.add(file);
        }
      }
    }
  }
  return [...files];
}

/** Every photo file the journal's images name — what a device should hold to show the whole journal. */
export function allPhotoFiles(images: Map<string, ImageView>): string[] {
  const files = new Set<string>();
  for (const image of images.values()) {
    for (const path of [image.path2048, image.path400]) {
      const file = photoFileName(path);
      if (file !== '') files.add(file);
    }
  }
  return [...files];
}
