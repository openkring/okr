import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { isBrowser } from '@bk2/shared-util-core';

export const CONSENT_KEY = 'cookie_consent_v1';

export interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  decided: boolean;
  timestamp?: number;
}

export const DEFAULT_CONSENT: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  decided: false,
};

@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly subject = new BehaviorSubject<ConsentState>(this.load());

  readonly consent$ = this.subject.asObservable();

  public getState(): ConsentState {
    return this.subject.getValue();
  }

  public needsBanner(): boolean {
    return !this.subject.getValue().decided;
  }

  public hasAnalyticsConsent(): boolean {
    return this.subject.getValue().analytics;
  }

  public hasMarketingConsent(): boolean {
    return this.subject.getValue().marketing;
  }

  public acceptAll(): void {
    this.apply({ analytics: true, marketing: true, decided: true });
  }

  public rejectAll(): void {
    this.apply({ analytics: false, marketing: false, decided: true });
  }

  public setCustom(partial: Partial<Omit<ConsentState, 'necessary' | 'decided' | 'timestamp'>>): void {
    this.apply({ ...partial, decided: true });
  }

  public reset(): void {
    this.subject.next(DEFAULT_CONSENT);
    if (isBrowser(this.platformId)) {
      localStorage.removeItem(CONSENT_KEY);
    }
  }

  private apply(patch: Partial<ConsentState>): void {
    const next: ConsentState = {
      ...this.subject.getValue(),
      ...patch,
      necessary: true,
      timestamp: Date.now(),
    };
    this.subject.next(next);
    this.persist(next);
  }

  private load(): ConsentState {
    if (!isBrowser(this.platformId)) return DEFAULT_CONSENT;
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return DEFAULT_CONSENT;
      const parsed = JSON.parse(raw) as Partial<ConsentState>;
      return { ...DEFAULT_CONSENT, ...parsed, necessary: true };
    } catch {
      return DEFAULT_CONSENT;
    }
  }

  private persist(state: ConsentState): void {
    if (!isBrowser(this.platformId)) return;
    localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
  }
}
