import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { PRINT_FILL_LONG_PX, PRINT_FILL_SHORT_PX } from './journal-book-layout.util';

/**
 * Browser editing (spec 1.126 phase 3): the pure math of the browser photo pipeline — file sizes (mirroring the
 * iPad plugin) and the EXIF values read with exifr.
 */
export const WEB_PHOTO_ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,image/webp';
export const WEB_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

export interface PixelSize {
  width: number;
  height: number;
}

function scaleBy(size: PixelSize, factor: number): PixelSize {
  return { width: Math.round(size.width * factor), height: Math.round(size.height * factor) };
}

/** Longest edge at most maxPixel, never enlarged, rounded. */
export function scaledSize(size: PixelSize, maxPixel: number): PixelSize {
  const long = Math.max(size.width, size.height);
  if (long <= maxPixel) return { width: size.width, height: size.height };
  return scaleBy(size, maxPixel / long);
}

/** The print file size: the smallest that still fills a bleed page at 300 dpi, never enlarged (iPad exportOriginal). */
export function printSize(size: PixelSize): PixelSize {
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  if (long <= 0 || short <= 0) return { width: size.width, height: size.height };
  return scaleBy(size, Math.min(1, Math.max(PRINT_FILL_LONG_PX / long, PRINT_FILL_SHORT_PX / short)));
}

/** EXIF DateTimeOriginal ('yyyy:MM:dd HH:mm:ss', raw — exifr with reviveValues:false) → 'yyyy-MM-ddTHH:mm:ss', else undefined. */
export function exifTakenAt(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) return undefined;
  const iso = convertDateFormatToString(digits, DateFormat.StoreDateTime, DateFormat.IsoDateTime, false);
  return iso === '' ? undefined : iso;
}

/** A usable position: both finite, in range, and not 0/0. */
export function exifPosition(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | undefined {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  if (latitude === 0 && longitude === 0) return undefined;
  return { latitude, longitude };
}

/** The three file names of a browser photo. */
export function webPhotoFiles(imageKey: string): { file400: string; file2048: string; filePrint: string } {
  return { file400: `${imageKey}-400.jpg`, file2048: `${imageKey}-2048.jpg`, filePrint: `${imageKey}-print.jpg` };
}
