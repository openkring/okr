import { Injectable } from '@angular/core';
import { captureMessage } from '@sentry/angular';
import type { MatrixClient } from 'matrix-js-sdk';
import { Observable, Subject } from 'rxjs';

import { IMAGE_PREVIEW_EDGE_PX, shouldUseImagePreview } from '@okr/chat-util';

/** P-1: upper bound for the mxc→blob-URL cache (LRU eviction). */
const MEDIA_CACHE_MAX = 200;

/**
 * SCS-92: gateway statuses that come from the reverse proxy in front of the homeserver,
 * never from the media itself. They are transient, so one retry is worth the wait.
 */
const RETRYABLE_STATUS = new Set([502, 503, 504]);
/** Delay before the single retry of a gateway failure or a thrown fetch. */
const RETRY_DELAY_MS = 500;

/**
 * SCS-A4: messages of a fetch that died in transport rather than at the homeserver.
 *
 * Every engine words this differently and none of the wordings carry information: Safari
 * raises "Load failed", wraps it as "FetchEvent.respondWith received an error: …" when the
 * request passed through the service worker, and reports "The network connection was lost"
 * when the radio switches; Chrome says "Failed to fetch", Firefox "NetworkError …". They all
 * mean the same thing — the request never produced a response — and they fire routinely when
 * an iOS tab is backgrounded mid-download or the device changes network. `navigator.onLine`
 * does NOT distinguish them (Safari keeps reporting `true` through exactly these aborts),
 * which is why the SCS-9Q offline guard let SCS-A4 through.
 *
 * The trade-off is deliberate: a CORS or CSP regression on the media host surfaces with these
 * same messages and is now silent here. That class of failure breaks the Matrix sync and API
 * calls too, so it is reported by those paths — whereas a single backgrounded phone is only
 * ever visible here, and only as noise. Everything that says something about the requested
 * file (HTTP status, missing URL, unexpected error type) is still reported.
 */
function isTransportFailure(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('load failed')
    || m.includes('failed to fetch')
    || m.includes('networkerror')
    || m.includes('network connection was lost')
    || m.includes('fetchevent.respondwith');
}

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
  private readonly cache = new Map<string, string>(); // mxc (or `mxc#preview`) → blob URL (insertion order = LRU order)
  /** Reasons already reported this session — see reportSilentFailure. */
  private readonly reportedFailures = new Set<string>();
  private readonly authFailed$ = new Subject<void>();
  /** SCS-92: emitted at most once per attached client — see the 401 branch below. */
  private authFailureSignalled = false;

  /**
   * Emits when the homeserver rejects the access token on a media download (HTTP 401).
   * Media is fetched with a raw `fetch()` outside the SDK, so it hits an expired token
   * while rendering the cached timeline — well before the sync loop reports
   * `M_UNKNOWN_TOKEN`. MatrixChatService listens and starts re-authentication here
   * instead of leaving avatars and images blank until sync catches up (SCS-92).
   */
  public get authFailed(): Observable<void> {
    return this.authFailed$.asObservable();
  }

  /** Attach/detach the Matrix client. Detaching (null) revokes and clears the cache. */
  public setClient(client: MatrixClient | null): void {
    this.client = client;
    this.authFailureSignalled = false;
    if (!client) this.clear();
  }

  /**
   * Fetch a Matrix media URL with auth and return a blob URL of the ORIGINAL file.
   * Caches results to avoid redundant fetches. Returns '' on any failure — nothing is cached
   * then, so a later call tries again.
   * @param mimeTypeHint - expected MIME type; used to fix generic content-types returned by some homeservers
   */
  public async resolveMediaUrl(mxcUrl: string | undefined, mimeTypeHint?: string): Promise<string> {
    if (!this.client || !mxcUrl || !mxcUrl.startsWith('mxc://')) return '';
    const cached = this.cacheGet(mxcUrl);
    if (cached) return cached;
    const httpUrl = this.client.mxcUrlToHttp(mxcUrl, undefined, undefined, undefined, false, true, true) ?? '';
    if (!httpUrl) {
      this.reportSilentFailure('mxcUrlToHttp returned no URL');
      return '';
    }
    const { url } = await this.fetchToBlobUrl(httpUrl, mxcUrl, 'media download failed', mimeTypeHint);
    return url;
  }

  /**
   * The URL to SHOW an attachment in the message list: the homeserver's scaled preview for a
   * large photo, the original for everything else (see shouldUseImagePreview).
   *
   * A photo straight off a phone is 7–10 MB and the preview ~100 KB. Downloading the original
   * just to draw a 300 px tile took long enough on mobile data to be cut off by a backgrounded
   * tab or a network switch, and the tile then read "image unavailable".
   *
   * An original that is already in the cache — the sender's own upload (seedMedia) or an image
   * opened in the lightbox — wins over the preview. A preview the server refuses outright
   * (4xx: format it cannot thumbnail) falls back to the original; a transient failure returns
   * '' so the caller can retry later.
   */
  public async resolvePreviewUrl(mxcUrl: string | undefined, mimeTypeHint?: string, sizeBytes?: number): Promise<string> {
    if (!shouldUseImagePreview(mimeTypeHint, sizeBytes)) return this.resolveMediaUrl(mxcUrl, mimeTypeHint);
    if (!this.client || !mxcUrl || !mxcUrl.startsWith('mxc://')) return '';
    const original = this.cacheGet(mxcUrl);
    if (original) return original;
    const cacheKey = `${mxcUrl}#preview`;
    const cached = this.cacheGet(cacheKey);
    if (cached) return cached;
    const httpUrl = this.client.mxcUrlToHttp(
      mxcUrl, IMAGE_PREVIEW_EDGE_PX, IMAGE_PREVIEW_EDGE_PX, 'scale', false, true, true,
    ) ?? '';
    if (!httpUrl) return this.resolveMediaUrl(mxcUrl, mimeTypeHint);
    // No MIME hint: the preview is re-encoded by the server and carries its own correct type.
    const { url, status } = await this.fetchToBlobUrl(httpUrl, cacheKey, 'preview download failed');
    if (url) return url;
    const refused = status !== undefined && status >= 400 && status < 500 && status !== 401;
    return refused ? this.resolveMediaUrl(mxcUrl, mimeTypeHint) : '';
  }

  /**
   * Remember a file the user just uploaded as the resolved original of its `mxc://` URI, so
   * the sender's own message shows the photo at once instead of downloading back the bytes
   * the device already holds. Call it after the upload and BEFORE the event is sent — the
   * local echo resolves its media immediately.
   */
  public seedMedia(mxcUrl: string, blob: Blob): void {
    if (!mxcUrl.startsWith('mxc://') || blob.size === 0) return;
    if (this.cacheGet(mxcUrl)) return;
    this.cacheSet(mxcUrl, URL.createObjectURL(blob));
  }

  /**
   * Download one media URL into a blob URL and cache it under `cacheKey`.
   * `url` is '' on failure; `status` is the HTTP status of a failed response (undefined when
   * the fetch threw), so a caller can tell a refusal from a transient failure.
   */
  private async fetchToBlobUrl(
    httpUrl: string, cacheKey: string, failureLabel: string, mimeTypeHint?: string,
  ): Promise<{ url: string; status?: number }> {
    try {
      const accessToken = this.client?.getAccessToken();
      const headers: Record<string, string> = accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
      const resp = await this.fetchOnceRetrying(httpUrl, headers);
      if (!resp.ok) {
        this.reportSilentFailure(`${failureLabel}: HTTP ${resp.status}`);
        // 401 is never about this one file — the token is gone. Signal once per client
        // so the facade can re-authenticate; further 401s belong to the same dead token.
        if (resp.status === 401 && !this.authFailureSignalled) {
          this.authFailureSignalled = true;
          this.authFailed$.next();
        }
        return { url: '', status: resp.status };
      }
      const raw = await resp.blob();
      // Some homeservers serve media with mismatched or generic content-types (e.g. application/octet-stream).
      // Re-wrap with the known MIME type so browsers render it correctly (especially critical for SVG in <img>).
      const blob = (mimeTypeHint && !raw.type.startsWith(mimeTypeHint.split(';')[0].trim()))
        ? new Blob([await raw.arrayBuffer()], { type: mimeTypeHint })
        : raw;
      const blobUrl = URL.createObjectURL(blob);
      this.cacheSet(cacheKey, blobUrl);
      return { url: blobUrl, status: resp.status };
    } catch (ex) {
      // SCS-9Q: a fetch that throws never reached the homeserver — on Safari that is the
      // generic "Load failed" TypeError, raised when the device switches network, the tab is
      // backgrounded mid-request or the connection simply drops. Nothing about it is
      // actionable from here, so don't file a ticket for it. The caller retries later.
      const message = (ex as Error | null)?.message ?? 'unknown';
      if (!isTransportFailure(message)) this.reportSilentFailure(`media fetch threw: ${message}`);
      return { url: '' };
    }
  }

  /** Cache lookup that marks the entry most-recently-used (P-1). */
  private cacheGet(key: string): string | undefined {
    const cached = this.cache.get(key);
    if (cached) {
      // P-1: re-insert moves the entry to the end of the Map order.
      this.cache.delete(key);
      this.cache.set(key, cached);
    }
    return cached;
  }

  /**
   * P-1: bounded insert — evict and revoke the least-recently-used entry when full, so long
   * sessions in image-heavy rooms don't leak blob URLs unboundedly.
   */
  private cacheSet(key: string, blobUrl: string): void {
    if (this.cache.size >= MEDIA_CACHE_MAX) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        const oldestUrl = this.cache.get(oldestKey);
        if (oldestUrl?.startsWith('blob:')) URL.revokeObjectURL(oldestUrl);
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, blobUrl);
  }

  /**
   * Fetch once, retrying a single time when the attempt was transient.
   *
   * Two kinds of blip get the retry (SCS-92, SCS-9Q): a 502/503/504 from the media proxy in
   * front of the homeserver, and a fetch that throws before any response arrives (dropped or
   * switched connection). Neither says anything about the requested file, and every failure
   * path in the caller returns '' and leaves the avatar or attachment blank until something
   * re-renders it — so one retry is worth the wait. A second failure is passed on: a thrown
   * fetch rethrows into the caller's catch, a bad status is returned for the !ok branch.
   */
  private async fetchOnceRetrying(httpUrl: string, headers: Record<string, string>): Promise<Response> {
    try {
      const resp = await fetch(httpUrl, { headers });
      if (!RETRYABLE_STATUS.has(resp.status)) return resp;
      await this.delay(RETRY_DELAY_MS);
      return await fetch(httpUrl, { headers });
    } catch {
      await this.delay(RETRY_DELAY_MS);
      return await fetch(httpUrl, { headers });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Report a media resolution that failed WITHOUT any user-facing signal.
   *
   * Every failure path here returns '' — the caller then leaves `mediaUrl` unset and the
   * message list simply renders nothing where the attachment should be. There is no toast
   * and no thrown error, so Sentry is the only place such a failure can ever be observed.
   * (This silence is why the misclassified-image bug went unreported for so long: the
   * console line dies with the tab, and no app installs captureConsoleIntegration.)
   *
   * Deliberately captureMessage, not captureException: none of these are exceptional
   * control flow, and the reason string is the whole diagnosis. The mxc URI is NOT
   * attached — it identifies a specific piece of member-uploaded content.
   */
  private reportSilentFailure(reason: string): void {
    // One report per distinct reason per session. This path also resolves every sender,
    // voter and room avatar, so a single unreachable homeserver or one 404'd avatar
    // re-rendered on each message would otherwise file hundreds of identical issues and
    // bury the one-off failures this exists to surface.
    if (this.reportedFailures.has(reason)) return;
    this.reportedFailures.add(reason);
    captureMessage(`MatrixMediaService.resolveMediaUrl failed silently: ${reason}`, {
      level: 'warning',
      tags: { chatMedia: 'resolve-failed' },
    });
  }

  /** Revoke all cached blob URLs and empty the cache. */
  public clear(): void {
    for (const url of this.cache.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
    this.cache.clear();
    this.reportedFailures.clear();
  }
}
