import { inject, Injectable } from '@angular/core';

import { JournalBookService, PickedPhoto, SkippedPhoto } from '@okr/travel-journal-data-access';
import { exifPosition, exifTakenAt, PixelSize, printSize, scaledSize, WEB_PHOTO_ACCEPT, WEB_PHOTO_MAX_BYTES, webPhotoFiles } from '@okr/travel-journal-util';

import { JournalFileUrlService } from './journal-file-url.service';

/** A browser photo: the same shape the iPad plugin returns, plus its key and the size of its print file. */
export interface WebPhoto extends PickedPhoto {
  imageKey: string;
  printSize: PixelSize;
}

const SMALL_PX = 400;
const LARGE_PX = 2048;
const QUALITY = 0.8;
const PRINT_QUALITY = 0.92;
const RETRY_QUALITY = 0.7;
/** After the dialog closes, `change` may arrive a moment after focus returns; wait before treating it as a cancel. */
const FOCUS_CANCEL_MS = 1000;

/**
 * Browser editing (spec 1.126 phase 3 §3): photos picked in the browser become the same files the iPad produces —
 * `<imageKey>-400.jpg` and `<imageKey>-2048.jpg` (quality 0.8) — plus `<imageKey>-print.jpg` (quality 0.92), at the
 * same private-bucket paths. A photo is returned only once all three files are in the bucket; the caller writes the
 * records after that. Browser only, but safe to construct on iOS (no DOM access before a method is called).
 */
@Injectable({ providedIn: 'root' })
export class JournalWebPhotos {
  private readonly bookService = inject(JournalBookService);
  private readonly fileUrlService = inject(JournalFileUrlService);

  /** Opens the file dialog (multiple, WEB_PHOTO_ACCEPT); resolves [] on cancel. Call it synchronously inside the user's tap (WebKit may ignore the click otherwise). */
  public pickFiles(): Promise<File[]> {
    return new Promise<File[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = WEB_PHOTO_ACCEPT;
      let settled = false;
      let focusTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (files: File[]): void => {
        if (settled) return;
        settled = true;
        if (focusTimer) clearTimeout(focusTimer);
        window.removeEventListener('focus', onFocus);
        resolve(files);
      };
      const onFocus = (): void => {
        focusTimer = setTimeout(() => finish(Array.from(input.files ?? [])), FOCUS_CANCEL_MS);
      };
      input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true });
      input.addEventListener('cancel', () => finish([]), { once: true });
      // only where the input has no `cancel` event: elsewhere a slow `change` (Safari transcoding many HEIC picks) can
      // arrive after the focus timer and the real selection would be lost
      if (!('oncancel' in input)) window.addEventListener('focus', onFocus);
      input.click();
    });
  }

  /** Encodes and uploads every file; a photo is in `photos` only when all three files are in the bucket. */
  public async upload(
    journalKey: string,
    files: File[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ photos: WebPhoto[]; skipped: SkippedPhoto[] }> {
    const photos: WebPhoto[] = [];
    const skipped: SkippedPhoto[] = [];
    // one at a time: a decoded 48 MP bitmap plus its canvases is a lot of memory
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await this.uploadOne(journalKey, file);
      if ('reason' in result) skipped.push(result);
      else photos.push(result);
      onProgress?.(i + 1, files.length);
    }
    return { photos, skipped };
  }

  private async uploadOne(journalKey: string, file: File): Promise<WebPhoto | SkippedPhoto> {
    const imageKey = crypto.randomUUID();
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return { localIdentifier: file.name, reason: 'unreadable' };
    }
    try {
      const { takenAt, latitude, longitude } = await this.readExif(file);
      const size: PixelSize = { width: bitmap.width, height: bitmap.height };
      const print = printSize(size);
      const names = webPhotoFiles(imageKey);
      const blob400 = await this.encodeWithinLimit(bitmap, scaledSize(size, SMALL_PX), QUALITY);
      const blob2048 = await this.encodeWithinLimit(bitmap, scaledSize(size, LARGE_PX), QUALITY);
      const blobPrint = await this.encodeWithinLimit(bitmap, print, PRINT_QUALITY);
      if (!blob400 || !blob2048 || !blobPrint) return { localIdentifier: file.name, reason: 'writeFailed' };

      const blobs: Record<string, Blob> = { [names.file400]: blob400, [names.file2048]: blob2048, [names.filePrint]: blobPrint };
      try {
        const uploads = await this.bookService.prepareUploads(journalKey, [names.file400, names.file2048, names.filePrint]);
        if (Object.keys(blobs).some((name) => !uploads.some((u) => u.file === name))) throw new Error('missing upload slot');
        for (const upload of uploads) {
          if (upload.done) continue;
          const blob = blobs[upload.file];
          if (!blob || !upload.url) throw new Error(`no upload target for ${upload.file}`);
          await this.bookService.putFile(upload, blob);
        }
      } catch {
        return { localIdentifier: file.name, reason: 'writeFailed' };
      }

      const path400 = `journals/${journalKey}/${names.file400}`;
      const path2048 = `journals/${journalKey}/${names.file2048}`;
      this.fileUrlService.seed(path400, URL.createObjectURL(blob400));
      this.fileUrlService.seed(path2048, URL.createObjectURL(blob2048));
      return {
        imageKey,
        localIdentifier: '',
        takenAt,
        latitude,
        longitude,
        width: bitmap.width,
        height: bitmap.height,
        path2048,
        path400,
        printSize: print,
      };
    } finally {
      bitmap.close();
    }
  }

  /** DateTimeOriginal and GPS; anything unreadable is simply left out. exifr is loaded lazily (lazy-loading rule). */
  private async readExif(file: File): Promise<{ takenAt?: string; latitude?: number; longitude?: number }> {
    try {
      const exifr = (await import('exifr')).default;
      const tags = (await exifr.parse(file, { reviveValues: false, gps: true, pick: ['DateTimeOriginal', 'latitude', 'longitude'] })) as
        | Record<string, unknown>
        | undefined;
      const takenAt = exifTakenAt(tags?.['DateTimeOriginal']);
      let position = exifPosition(tags?.['latitude'], tags?.['longitude']);
      if (!position) {
        // the computed latitude/longitude may be dropped with reviveValues:false — ask exifr's GPS reader directly
        const gps = await exifr.gps(file).catch(() => undefined);
        position = exifPosition(gps?.latitude, gps?.longitude);
      }
      return { takenAt, latitude: position?.latitude, longitude: position?.longitude };
    } catch {
      return {};
    }
  }

  /** One JPEG at the given size; over WEB_PHOTO_MAX_BYTES it is encoded once more at 0.7, then given up (undefined). */
  private async encodeWithinLimit(bitmap: ImageBitmap, size: PixelSize, quality: number): Promise<Blob | undefined> {
    try {
      let blob = await this.encode(bitmap, size, quality);
      if (blob.size > WEB_PHOTO_MAX_BYTES) blob = await this.encode(bitmap, size, RETRY_QUALITY);
      return blob.size > WEB_PHOTO_MAX_BYTES ? undefined : blob;
    } catch {
      return undefined;
    }
  }

  /** Draws the (upright) bitmap scaled into an OffscreenCanvas, or a DOM canvas where that is missing, and encodes a JPEG. */
  private async encode(bitmap: ImageBitmap, size: PixelSize, quality: number): Promise<Blob> {
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, width, height);
        return canvas.convertToBlob({ type: 'image/jpeg', quality });
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d canvas');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas encode failed'))), 'image/jpeg', quality)
    );
  }
}
