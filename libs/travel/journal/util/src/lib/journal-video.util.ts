import { ImageView } from './journal-view.util';

export const MAX_VIDEO_SEC = 60; // longest clip the journal takes
export const MAX_VIDEOS_PER_BLOCK = 5;
export const MAX_VIDEO_BYTES = 7_800_000; // the compressed clip must fit the upload limit
export const MAX_VIDEO_SOURCE_BYTES = 524_288_000; // the original picked from the library (500 MiB)

/** A video clip is an image record that also carries its mp4. */
export function isVideoImage(image: ImageView): boolean {
  return !!image.videoPath;
}

export function isVideoFile(file: string): boolean {
  return /-video\.mp4$/.test(file);
}

/** Posters and photos (.jpg) first, clips (.mp4) after them; stable within each group. */
export function uploadOrder(files: string[]): string[] {
  return [...files.filter((f) => !isVideoFile(f)), ...files.filter(isVideoFile)];
}

/** The clips still to upload: published, on this device, not uploaded yet — and their known total size. */
export function pendingVideoStats(
  rows: { file: string; uploaded: boolean; present: boolean }[],
  published: Set<string>,
  sizes: Record<string, number>,
): { count: number; bytes: number } {
  const pending = rows.filter((r) => isVideoFile(r.file) && published.has(r.file) && r.present && !r.uploaded);
  return { count: pending.length, bytes: pending.reduce((sum, r) => sum + (sizes[r.file] ?? 0), 0) };
}
