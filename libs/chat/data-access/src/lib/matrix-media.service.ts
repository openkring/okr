import { Injectable } from '@angular/core';
import type { MatrixClient } from 'matrix-js-sdk';

/** P-1: upper bound for the mxc→blob-URL cache (LRU eviction). */
const MEDIA_CACHE_MAX = 200;

/**
 * Authenticated Matrix media resolution with a bounded LRU blob-URL cache.
 * Extracted from MatrixChatService (design review #4 / ARCH-2); the facade sets
 * the client on initialize/disconnect and delegates all media lookups here.
 */
@Injectable({
  providedIn: 'root'
})
export class MatrixMediaService {
  private client: MatrixClient | null = null;
  private readonly cache = new Map<string, string>(); // mxc → blob URL (insertion order = LRU order)

  /** Attach/detach the Matrix client. Detaching (null) revokes and clears the cache. */
  public setClient(client: MatrixClient | null): void {
    this.client = client;
    if (!client) this.clear();
  }

  /**
   * Fetch a Matrix media URL with auth and return a blob URL.
   * Caches results to avoid redundant fetches.
   * @param mimeTypeHint - expected MIME type; used to fix generic content-types returned by some homeservers
   */
  public async resolveMediaUrl(mxcUrl: string | undefined, mimeTypeHint?: string): Promise<string> {
    if (!this.client || !mxcUrl || !mxcUrl.startsWith('mxc://')) return '';
    const cached = this.cache.get(mxcUrl);
    if (cached) {
      // P-1: mark as most-recently-used (re-insert moves it to the end of the Map order).
      this.cache.delete(mxcUrl);
      this.cache.set(mxcUrl, cached);
      return cached;
    }
    const httpUrl = this.client.mxcUrlToHttp(mxcUrl, undefined, undefined, undefined, false, true, true) ?? '';
    if (!httpUrl) return '';
    try {
      const accessToken = this.client.getAccessToken();
      const resp = await fetch(httpUrl, {
        headers: accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}
      });
      if (!resp.ok) return '';
      const raw = await resp.blob();
      // Some homeservers serve media with mismatched or generic content-types (e.g. application/octet-stream).
      // Re-wrap with the known MIME type so browsers render it correctly (especially critical for SVG in <img>).
      const blob = (mimeTypeHint && !raw.type.startsWith(mimeTypeHint.split(';')[0].trim()))
        ? new Blob([await raw.arrayBuffer()], { type: mimeTypeHint })
        : raw;
      const blobUrl = URL.createObjectURL(blob);
      // P-1: bound the cache — evict and revoke the least-recently-used entry when full,
      // so long sessions in image-heavy rooms don't leak blob URLs unboundedly.
      if (this.cache.size >= MEDIA_CACHE_MAX) {
        const oldestKey = this.cache.keys().next().value as string | undefined;
        if (oldestKey !== undefined) {
          const oldestUrl = this.cache.get(oldestKey);
          if (oldestUrl?.startsWith('blob:')) URL.revokeObjectURL(oldestUrl);
          this.cache.delete(oldestKey);
        }
      }
      this.cache.set(mxcUrl, blobUrl);
      return blobUrl;
    } catch {
      return '';
    }
  }

  /** Revoke all cached blob URLs and empty the cache. */
  public clear(): void {
    for (const url of this.cache.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}
