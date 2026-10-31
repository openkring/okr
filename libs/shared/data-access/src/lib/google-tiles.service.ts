import { inject, Injectable } from '@angular/core';

import { ENV } from '@okr/shared-config';

export type GoogleMapType = 'roadmap' | 'satellite';

export interface GoogleTilesView {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface CachedSession {
  session: string;
  expiry: number;
}

const BASE = 'https://tile.googleapis.com';
const RENEW_BEFORE_S = 86400;
/** Every Map Tiles request gives up after this: a Wi-Fi without an uplink must not hang a request for minutes. */
const FETCH_TIMEOUT_MS = 8000;

/** Result of `probe`: the token works, Google refused it (4xx), or Google could not be reached (timeout, 5xx, offline). */
export type GoogleProbe = 'ok' | 'refused' | 'failed';

/**
 * Google Map Tiles API sessions (roadmap / satellite) for the Leaflet layers.
 * Never throws: no key, offline or any error resolves `undefined` / ''. A failure is logged once per map type.
 * A cached token is no proof the network works (a Wi-Fi without internet): callers prove reachability with `probe`.
 */
@Injectable({ providedIn: 'root' })
export class GoogleTiles {
  private readonly env = inject(ENV);
  private readonly logged = new Set<string>();
  private readonly pending = new Map<string, Promise<string | undefined>>();

  /** Session token for the map type; cached in localStorage until < 1 day before expiry. `language` is the app language code (de, fr, ...). */
  public session(mapType: GoogleMapType, language: string): Promise<string | undefined> {
    const key = this.cacheKey(mapType, language);
    const cached = this.readCache(key);
    if (cached) return Promise.resolve(cached);
    const running = this.pending.get(key);
    if (running) return running;
    return this.track(key, this.create(mapType, language, key));
  }

  /** The cached token without any request, if it is still valid for more than a day. */
  public cached(mapType: GoogleMapType, language: string): string | undefined {
    return this.readCache(this.cacheKey(mapType, language));
  }

  /**
   * A new session (Google refused the tiles of the cached one). The cache is replaced only when the new session exists:
   * a failed or timed-out create keeps the cached token, which may still be valid.
   */
  public renew(mapType: GoogleMapType, language: string): Promise<string | undefined> {
    const key = this.cacheKey(mapType, language);
    return this.pending.get(key) ?? this.track(key, this.create(mapType, language, key)); // a running create is new too
  }

  /** Proves the network reaches Google with this token: one cheap viewport request at zoom 0 for the whole world. */
  public async probe(session: string): Promise<GoogleProbe> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'failed';
    try {
      const res = await fetch(this.viewportUrl(session, { west: -180, south: -85, east: 180, north: 85 }, 0), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) return 'ok';
      return res.status >= 400 && res.status < 500 ? 'refused' : 'failed';
    } catch {
      return 'failed';
    }
  }

  /** Leaflet URL template for a session. */
  public tileUrl(session: string): string {
    return `${BASE}/v1/2dtiles/{z}/{x}/{y}?session=${session}&key=${this.apiKey()}`;
  }

  /** Viewport copyright for the visible area; '' on error. Caller debounces. */
  public async attribution(session: string, view: GoogleTilesView, zoom: number): Promise<string> {
    try {
      const res = await fetch(this.viewportUrl(session, view, zoom), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) return '';
      const body = (await res.json()) as { copyright?: string };
      return body.copyright ?? '';
    } catch {
      return '';
    }
  }

  private viewportUrl(session: string, view: GoogleTilesView, zoom: number): string {
    return `${BASE}/tile/v1/viewport?session=${session}&key=${this.apiKey()}&zoom=${Math.round(zoom)}` +
      `&north=${view.north}&south=${view.south}&east=${view.east}&west=${view.west}`;
  }

  /** One create per cache key at a time: a second caller shares the running request. */
  private track(key: string, create: Promise<string | undefined>): Promise<string | undefined> {
    const p = create.finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  private apiKey(): string {
    return this.env.services?.gmapKey ?? '';
  }

  private cacheKey(mapType: GoogleMapType, language: string): string {
    return `okr.gmaps.session.${mapType}.${language}-CH`;
  }

  private readCache(key: string): string | undefined {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return undefined;
      const c = JSON.parse(raw) as CachedSession;
      if (c?.session && Number(c.expiry) - Date.now() / 1000 >= RENEW_BEFORE_S) return c.session;
    } catch {
      /* ignore */
    }
    return undefined;
  }

  private async create(mapType: GoogleMapType, language: string, key: string): Promise<string | undefined> {
    const apiKey = this.apiKey();
    if (!apiKey) return undefined;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;
    try {
      const res = await fetch(`${BASE}/v1/createSession?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapType, language: `${language}-CH`, region: 'CH' }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`createSession ${res.status}`);
      const body = (await res.json()) as { session?: string; expiry?: string };
      if (!body.session) throw new Error('createSession: no session');
      try {
        localStorage.setItem(key, JSON.stringify({ session: body.session, expiry: Number(body.expiry) } satisfies CachedSession));
      } catch {
        /* storage unavailable */
      }
      return body.session;
    } catch (e) {
      if (!this.logged.has(mapType)) {
        this.logged.add(mapType);
        console.error('[GoogleTiles] session failed', mapType, e);
      }
      return undefined;
    }
  }
}
