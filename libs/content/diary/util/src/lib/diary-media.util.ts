import { ImageConfig, ImageType } from '@okr/shared-models';
import { getExtensionFromMimeType, reduceLogoName } from '@okr/shared-util-core';

/**
 * One file of a diary day folder in Drive, as `listDiaryMedia` returns it (spec 1.106 §2.3).
 * Held in memory only. The function inlines the thumbnail as a `data:` URL: the files are private,
 * and Drive serves a private file's `thumbnailLink` only to a credentialed request — the browser
 * has no Drive credentials, so an `<img>` on that link always fails (the grey tiles).
 */
export interface DiaryMediaFile {
  id: string;
  name: string;
  mimeType: string;
  /** `data:` URL of a small rendition; '' when Drive has no thumbnail for this file */
  thumbnail: string;
  webViewLink: string;
}

export interface DiaryMediaResult {
  /** images AND videos — the thumbnail row; a video tile opens Drive's player */
  images: DiaryMediaFile[];
  documents: DiaryMediaFile[];
  /**
   * The Drive day folder that was read — also when the function had to look it up by date
   * because the entry was created in the app (`driveFolderId: ''`); absent when there is none.
   */
  folderId?: string;
}

/** A Drive thumbnail link at another size: replaces a trailing `=s<n>` or appends `=s<px>`. */
export function driveThumbnailAtSize(link: string, px: number): string {
  if (!link) return '';
  return /=s\d+$/.test(link) ? link.replace(/=s\d+$/, `=s${px}`) : `${link}=s${px}`;
}

/** A video in the thumbnail row: drawn with a play overlay, opened in Drive (the slider shows images only). */
export function isDiaryVideo(file: DiaryMediaFile | undefined): boolean {
  return !!file?.mimeType.startsWith('video/');
}

/** Icon name in the `filetypes` set for a document tile without a Drive thumbnail. */
export function diaryFileIconName(mimeType: string): string {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  return reduceLogoName(getExtensionFromMimeType(mimeType).toLowerCase());
}

/**
 * The full-size slider over a day's images. Videos, and an image without a Drive thumbnail (no
 * rendition), are left out — the tapped index is re-mapped so the slider still opens on it. `large` holds
 * the slider-size `data:` URLs loaded so far (by file id); an image without one falls back to its
 * thumbnail.
 */
export function diarySliderImages(
  files: DiaryMediaFile[], tappedIndex: number, large: ReadonlyMap<string, string> = new Map(),
): { images: ImageConfig[]; startIndex: number } {
  const tapped = files[tappedIndex];
  const shown = files.filter(f => !!f.thumbnail && !isDiaryVideo(f));
  const images = shown.map(f => ({
    label: f.name, type: ImageType.Image, url: large.get(f.id) || f.thumbnail,
    actionUrl: '', altText: f.name, overlay: '',
  }));
  return { images, startIndex: Math.max(0, shown.indexOf(tapped)) };
}
