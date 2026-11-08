import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { NewsSegment } from '@okr/shared-models';
import { ResolvedNewsSource } from '@okr/social-news-center-util';

interface GatewayResult<T> {
  data: T;
}

/**
 * The only way to reach a feed: the `newsCenter` callable fetches it server-side (allowlist, cache).
 * Errors (HttpsError `not-found` / `invalid-argument` / `permission-denied`) propagate to the caller.
 */
@Injectable({ providedIn: 'root' })
export class NewsRelayService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  private async call<T>(payload: Record<string, unknown>): Promise<T> {
    const callable = httpsCallable<Record<string, unknown>, T>(this.functions, 'newsCenter');
    const { data } = await callable(payload);
    return data;
  }

  public async fetchFeed(channelKey: string): Promise<{ body: string; contentType: string }> {
    const result = await this.call<GatewayResult<{ body: string; contentType: string }>>({ op: 'newsFeed', channelKey });
    return result.data;
  }

  /** A webcam still as a data URL (for `viaRelay` channels). */
  public async fetchImage(channelKey: string): Promise<string> {
    const result = await this.call<GatewayResult<{ dataUrl: string; contentType: string }>>({ op: 'newsImage', channelKey });
    return result.data.dataUrl;
  }

  public resolve(url: string, segment: NewsSegment): Promise<ResolvedNewsSource> {
    return this.call<ResolvedNewsSource>({ op: 'newsResolve', url, segment });
  }
}
