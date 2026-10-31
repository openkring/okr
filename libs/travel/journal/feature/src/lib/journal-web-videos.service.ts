import { inject, Injectable } from '@angular/core';

import { JournalBookService, PickedVideo, VideoSkipReason } from '@okr/travel-journal-data-access';
import { MAX_VIDEO_SOURCE_BYTES } from '@okr/travel-journal-util';

/** A browser video: the same shape the iPad plugin returns, plus its key. */
export interface WebVideo extends PickedVideo {
  imageKey: string;
}

/** A browser original can be 500 MB: a stalled PUT aborts after 10 min instead of the default 2. */
const SOURCE_PUT_TIMEOUT_MS = 600_000;
/** After the dialog closes, `change` may arrive a moment after focus returns; wait before treating it as a cancel. */
const FOCUS_CANCEL_MS = 1000;

/**
 * Browser video editing (spec 1.126 phase 5): the original goes to the private bucket as `<name>-source`, the
 * `convertJournalVideo` callable makes `<name>-video.mp4` plus the posters `<name>-2048.jpg` / `<name>-400.jpg`. A clip is
 * returned only once the function has converted it; the caller writes the records after that. Browser only, but safe
 * to construct on iOS (no DOM access before a method is called).
 */
@Injectable({ providedIn: 'root' })
export class JournalWebVideos {
  private readonly bookService = inject(JournalBookService);

  /** Opens the file dialog (multiple, video/*); resolves [] on cancel. Call it synchronously inside the user's tap (WebKit may ignore the click otherwise). */
  public pickFiles(): Promise<File[]> {
    return new Promise<File[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*';
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
      if (!('oncancel' in input)) window.addEventListener('focus', onFocus);
      input.click();
    });
  }

  /** Uploads and converts every file, one at a time; a clip is in `videos` only when the function converted it. */
  public async upload(
    journalKey: string,
    files: File[],
    progress: (done: number, total: number) => void
  ): Promise<{ videos: WebVideo[]; skipped: { localIdentifier: string; reason: VideoSkipReason }[] }> {
    const videos: WebVideo[] = [];
    const skipped: { localIdentifier: string; reason: VideoSkipReason }[] = [];
    for (let i = 0; i < files.length; i++) {
      const result = await this.uploadOne(journalKey, files[i]);
      if ('reason' in result) skipped.push(result);
      else videos.push(result);
      progress(i + 1, files.length);
    }
    return { videos, skipped };
  }

  private async uploadOne(journalKey: string, file: File): Promise<WebVideo | { localIdentifier: string; reason: VideoSkipReason }> {
    if (file.size > MAX_VIDEO_SOURCE_BYTES) return { localIdentifier: file.name, reason: 'tooLarge' };
    const name = crypto.randomUUID();
    try {
      const slot = await this.bookService.prepareVideoUpload(journalKey, name, file.type || 'video/mp4');
      await this.bookService.putFile(slot, file, SOURCE_PUT_TIMEOUT_MS);
    } catch {
      return { localIdentifier: file.name, reason: 'writeFailed' };
    }
    try {
      const converted = await this.bookService.convertVideo(journalKey, name);
      const base = `journals/${journalKey}/${name}`;
      return {
        imageKey: name,
        localIdentifier: '',
        takenAt: converted.takenAt,
        latitude: converted.latitude,
        longitude: converted.longitude,
        width: converted.width,
        height: converted.height,
        path2048: `${base}-2048.jpg`,
        path400: `${base}-400.jpg`,
        videoPath: `${base}-video.mp4`,
        durationSec: converted.durationSec,
      };
    } catch (error) {
      // HttpsError message: 'tooLong' | 'tooLarge' | 'unreadable'; 'already-exists' and anything else count as unreadable
      const message = error instanceof Error ? error.message : '';
      const reason: VideoSkipReason = message.includes('tooLong') ? 'tooLong' : message.includes('tooLarge') ? 'tooLarge' : 'unreadable';
      return { localIdentifier: file.name, reason };
    }
  }
}
