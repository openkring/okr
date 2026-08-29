import { Injectable } from '@angular/core';
import { captureMessage } from '@sentry/angular';
import type { MatrixClient } from 'matrix-js-sdk';
import { Observable, Subject } from 'rxjs';

/** P-1: upper bound for the mxc→blob-URL cache (LRU eviction). */
const MEDIA_CACHE_MAX = 200;

/**
 * SCS-92: gateway statuses that come from the reverse proxy in front of the homeserver,
 * never from the media itself. They are transient, so one retry is worth the wait.
 */
const RETRYABLE_STATUS = new Set([502, 503, 504]);
/** Delay before the single retry of a gateway failure. */
const RETRY_DELAY_MS = 500;

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
    if (!httpUrl) {
      this.reportSilentFailure('mxcUrlToHttp returned no URL');
      return '';
    }
    try {
      const accessToken = this.client.getAccessToken();
      const headers: Record<string, string> = accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
      let resp = await fetch(httpUrl, { headers });
      // SCS-92: a 502/503/504 is the media proxy timing out, not a problem with this file.
      // Every failure path here returns '' and leaves the avatar or attachment blank until
      // something re-renders it, so retry once instead of giving up on a transient blip.
      if (RETRYABLE_STATUS.has(resp.status)) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        resp = await fetch(httpUrl, { headers });
      }
      if (!resp.ok) {
        this.reportSilentFailure(`media download failed: HTTP ${resp.status}`);
        // 401 is never about this one file — the token is gone. Signal once per client
        // so the facade can re-authenticate; further 401s belong to the same dead token.
        if (resp.status === 401 && !this.authFailureSignalled) {
          this.authFailureSignalled = true;
          this.authFailed$.next();
        }
        return '';
      }
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
    } catch (ex) {
      this.reportSilentFailure(`media fetch threw: ${(ex as Error | null)?.message ?? 'unknown'}`);
      return '';
    }
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
