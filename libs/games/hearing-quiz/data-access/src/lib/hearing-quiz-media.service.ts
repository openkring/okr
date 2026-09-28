import { Injectable, inject } from '@angular/core';

import { UploadService } from '@okr/avatar-data-access';
import { ENV } from '@okr/shared-config';
import { generateRandomString, warn } from '@okr/shared-util-core';

import { audioExtension, hearingQuizFilePath } from '@okr/games-hearing-quiz-util';

export interface HearingQuizUpload {
  url: string;   // download URL, stored on the node
  path: string;  // storage path, stored on the node
}

/**
 * Files of the Hörtraining: uploading clips and hint images, and pre-fetching a session's clips.
 *
 * Audio is NOT an image and never goes through imgix; hint images are shown straight from their
 * download URL too (one small image per question, no thumbnails needed).
 */
@Injectable({ providedIn: 'root' })
export class HearingQuizMediaService {
  private readonly env = inject(ENV);
  private readonly uploadService = inject(UploadService);

  public async uploadAudio(file: File, nodeKey: string, title: string): Promise<HearingQuizUpload | undefined> {
    return this.upload(file, nodeKey, audioExtension(file.type), title);
  }

  public async uploadImage(file: File, nodeKey: string, title: string): Promise<HearingQuizUpload | undefined> {
    const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    return this.upload(file, nodeKey, extension, title);
  }

  private async upload(file: File, nodeKey: string, extension: string, title: string): Promise<HearingQuizUpload | undefined> {
    const path = hearingQuizFilePath(this.env.tenantId, nodeKey || 'new', generateRandomString(12), extension);
    const url = await this.uploadService.uploadFile(file, path, title);
    return url ? { url, path } : undefined;
  }

  /**
   * Fetch every clip of a session into memory and hand back `url → blob URL` (spec §11.6).
   *
   * Two reasons, both load-bearing: a dropped connection mid-session no longer breaks playback,
   * and a same-origin blob URL is what lets Web Audio's `MediaElementSource` read the samples for
   * loudness normalisation and the level meter — a cross-origin source would play silent through
   * the graph. A clip that fails to fetch keeps its original URL and still plays, just without
   * the offline guarantee. Release the map with `release()` when the session ends.
   */
  public async prefetch(urls: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(urls.filter(u => !!u))];
    const entries = await Promise.all(unique.map(async (url): Promise<[string, string]> => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return [url, URL.createObjectURL(blob)];
      } catch (ex) {
        warn(`HearingQuizMediaService.prefetch -> could not fetch ${url}: ${ex}`);
        return [url, url];
      }
    }));
    return new Map(entries);
  }

  public release(map: Map<string, string>): void {
    for (const [url, local] of map) {
      if (local !== url) URL.revokeObjectURL(local);
    }
  }
}
