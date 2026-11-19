import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { isBrowser } from '@okr/shared-util-core';

export const CONSENT_KEY = 'cookie_consent_v1';

/**
 * What the visitor did with the cookie notice. Since Google Analytics was removed (2026-11-19)
 * the app stores only what it needs to work, so the banner is a notice, not a choice: the only
 * state is whether this visitor has acknowledged it, and for which text.
 *
 * Older entries under the same key also carry `necessary`/`analytics`/`marketing` from the
 * consent banner of 2026-05 — they are ignored on read and dropped on the next write.
 */
export interface ConsentState {
  decided: boolean;
  /** {@link cookieNoticeHash} of the text that was acknowledged; a changed text shows the banner again. */
  textHash?: string;
  timestamp?: number;
}

export const DEFAULT_CONSENT: ConsentState = {
  decided: false,
};

/**
 * Short, stable fingerprint of a banner text (FNV-1a, 32 bit, hex). Not a security measure —
 * it only tells whether the tenant changed the wording since the visitor acknowledged it.
 */
export function cookieNoticeHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly subject = new BehaviorSubject<ConsentState>(this.load());

  public readonly consent$ = this.subject.asObservable();

  public getState(): ConsentState {
    return this.subject.getValue();
  }

  /**
   * True until the visitor acknowledged the notice. With `textHash`, also true when they
   * acknowledged a different text (or acknowledged before hashes were stored).
   */
  public needsBanner(textHash?: string): boolean {
    const state = this.subject.getValue();
    if (!state.decided) return true;
    return textHash !== undefined && state.textHash !== textHash;
  }

  /** The visitor acknowledged the notice showing the text with this hash. */
  public acknowledge(textHash?: string): void {
    const next: ConsentState = { decided: true, textHash, timestamp: Date.now() };
    this.subject.next(next);
    this.persist(next);
  }

  /** «Cookie-Einstellungen»: forget the acknowledgement so the banner shows again. */
  public reset(): void {
    this.subject.next(DEFAULT_CONSENT);
    if (!isBrowser(this.platformId)) return;
    try {
      localStorage.removeItem(CONSENT_KEY);
    } catch {
      // Safari private mode / blocked storage throws SecurityError — ignore.
    }
  }

  private load(): ConsentState {
    if (!isBrowser(this.platformId)) return DEFAULT_CONSENT;
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return DEFAULT_CONSENT;
      const parsed = JSON.parse(raw) as Partial<ConsentState>;
      return {
        decided: parsed.decided === true,
        textHash: typeof parsed.textHash === 'string' ? parsed.textHash : undefined,
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined,
      };
    } catch {
      return DEFAULT_CONSENT;
    }
  }

  private persist(state: ConsentState): void {
    if (!isBrowser(this.platformId)) return;
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
    } catch {
      // Safari private mode / blocked storage (SecurityError, DOMException 18) —
      // in-memory state still applies for this session; ignore.
    }
  }
}
