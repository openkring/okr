import { ImageConfig, ImageType } from '@okr/shared-models';
import { getExtensionFromMimeType, reduceLogoName } from '@okr/shared-util-core';

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

/** Icon name in the `filetypes` set for a document tile without a Drive thumbnail. */
export function diaryFileIconName(mimeType: string): string {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  return reduceLogoName(getExtensionFromMimeType(mimeType).toLowerCase());
}

/**
 * The full-size slider over a day's images. An image without a Drive thumbnail has no URL to
 * show and is left out — the tapped index is re-mapped so the slider still opens on it.
 */
export function diarySliderImages(files: DiaryMediaFile[], tappedIndex: number): { images: ImageConfig[]; startIndex: number } {
  const tapped = files[tappedIndex];
  const shown = files.filter(f => !!f.thumbnailLink);
  const images = shown.map(f => ({
    label: f.name, type: ImageType.Image, url: driveThumbnailAtSize(f.thumbnailLink, 2400),
    actionUrl: '', altText: f.name, overlay: '',
  }));
  return { images, startIndex: Math.max(0, shown.indexOf(tapped)) };
}
