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

/**
 * Google Map Tiles API sessions (roadmap / satellite) for the Leaflet layers.
 * Never throws: no key, offline or any error resolves `undefined` / ''. A failure is logged once per map type.
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
    const p = this.create(mapType, language, key).finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  /** Leaflet URL template for a session. */
  public tileUrl(session: string): string {
    return `${BASE}/v1/2dtiles/{z}/{x}/{y}?session=${session}&key=${this.apiKey()}`;
  }

  /** Viewport copyright for the visible area; '' on error. Caller debounces. */
  public async attribution(session: string, view: GoogleTilesView, zoom: number): Promise<string> {
    try {
      const url =
        `${BASE}/tile/v1/viewport?session=${session}&key=${this.apiKey()}&zoom=${Math.round(zoom)}` +
        `&north=${view.north}&south=${view.south}&east=${view.east}&west=${view.west}`;
      const res = await fetch(url);
      if (!res.ok) return '';
      const body = (await res.json()) as { copyright?: string };
      return body.copyright ?? '';
    } catch {
      return '';
    }
  }

  /** Forget the cached session (a tile 4xx after acceptance): next session() creates a new one. */
  public invalidate(mapType: GoogleMapType, language: string): void {
    try {
      localStorage.removeItem(this.cacheKey(mapType, language));
    } catch {
      /* storage unavailable */
    }
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
