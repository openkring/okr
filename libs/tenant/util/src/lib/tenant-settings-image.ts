import { checkUrlType, getImgixUrl, isDirectImageUrl } from '@okr/shared-util-core';

/** The two image formats a tenant can upload for its sign-in and «Not found» pages. */
export const SETTINGS_IMAGE_MIMETYPES: readonly string[] = ['image/jpeg', 'image/png'];

/** The file name part of each image field; the field is the key, so no other field can name a file. */
const IMAGE_BASENAMES: Readonly<Record<string, string>> = {
  welcomeBannerUrl: 'welcome',
  notfoundBannerUrl: 'not-found',
};

/** True for the fields that hold an uploaded image. */
export function isSettingsImageField(field: string): boolean {
  return Object.prototype.hasOwnProperty.call(IMAGE_BASENAMES, field);
}

/** 'jpg' or 'png' for the two accepted mime types (image/jpg, an alias some browsers report, counts as JPEG); undefined otherwise. */
export function settingsImageExtension(mimeType: string | undefined): 'jpg' | 'png' | undefined {
  const type = (mimeType ?? '').trim().toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type === 'image/png') return 'png';
  return undefined;
}

/**
 * The storage path of an uploaded image: `tenant/<id>/app/<welcome|not-found>-<timestamp>.<ext>`. Always a new name,
 * because the imgix cache survives a re-upload of the same one. Undefined when the tenant is empty or not a plain id,
 * or the field holds no image.
 */
export function settingsImagePath(tenantId: string, field: string, timestamp: string, extension: 'jpg' | 'png'): string | undefined {
  if (!isSettingsImageField(field) || !/^[A-Za-z0-9_-]+$/.test(tenantId)) return undefined;
  return `tenant/${tenantId}/app/${IMAGE_BASENAMES[field]}-${timestamp}.${extension}`;
}

/** The file name of a stored image path (or full url), as the settings card shows it; '' for nothing. */
export function settingsImageName(value: string): string {
  const last = value.trim().split(/[?#]/)[0].split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Where the browser loads a stored image from: a storage path goes through imgix (resized, as the sign-in page does),
 * an absolute https url stays as it is. '' for nothing, and for a value no image can be made of.
 */
export function settingsImagePreviewUrl(value: string, imgixBaseUrl: string): string {
  const path = value.trim();
  if (path === '') return '';
  if (isDirectImageUrl(path)) return getImgixUrl(path);
  if (checkUrlType(path) !== 'storage') return ''; // a legacy `assets/...` value is no file imgix can serve
  const url = getImgixUrl(path, 'auto=compress,format&fit=max&w=640');
  if (url === '') return '';
  return imgixBaseUrl === '' ? '' : `${imgixBaseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

/** The upload cap of `storage.rules` (`sizeOk()`: below 25 MB). A bigger file is refused there with a bare `storage/unauthorized`, so it is checked before. */
export const SETTINGS_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

export function settingsImageTooBig(bytes: number): boolean {
  return bytes >= SETTINGS_IMAGE_MAX_BYTES;
}
