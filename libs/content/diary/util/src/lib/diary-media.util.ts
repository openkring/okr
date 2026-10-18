/**
 * One file of a diary day folder in Drive, as `listDiaryMedia` returns it (spec 1.106 §2.3).
 * Held in memory only — `thumbnailLink` is a short-lived signed URL and is never stored.
 */
export interface DiaryMediaFile {
  id: string;
  name: string;
  mimeType: string;
  /** '' when Drive has no thumbnail for this file */
  thumbnailLink: string;
  webViewLink: string;
}

export interface DiaryMediaResult {
  images: DiaryMediaFile[];
  documents: DiaryMediaFile[];
}

/** A Drive thumbnail link at another size: replaces a trailing `=s<n>` or appends `=s<px>`. */
export function driveThumbnailAtSize(link: string, px: number): string {
  if (!link) return '';
  return /=s\d+$/.test(link) ? link.replace(/=s\d+$/, `=s${px}`) : `${link}=s${px}`;
}
