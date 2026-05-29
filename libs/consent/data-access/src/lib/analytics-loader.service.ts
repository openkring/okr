import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isBrowser } from '@bk2/shared-util-core';
import { ConsentService } from './consent.service';

type FirebaseAnalytics = import('firebase/analytics').Analytics;

@Injectable({ providedIn: 'root' })
export class AnalyticsLoaderService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly consentService = inject(ConsentService);
  private analytics: FirebaseAnalytics | undefined;

  public init(): void {
    if (!isBrowser(this.platformId)) return;
    this.consentService.consent$.subscribe(state => {
      if (state.analytics) {
        void this.enableAnalytics();
      } else {
        void this.disableAnalytics();
      }
    });
  }

  private async enableAnalytics(): Promise<void> {
    try {
      const { getAnalytics, isSupported, setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      if (!(await isSupported())) return;
      const { getApp } = await import('firebase/app');
      if (!this.analytics) {
        this.analytics = getAnalytics(getApp());
      }
      setAnalyticsCollectionEnabled(this.analytics, true);
    } catch {
      // analytics is non-essential — fail silently
    }
  }

  private async disableAnalytics(): Promise<void> {
    if (!this.analytics) return;
    try {
      const { setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      setAnalyticsCollectionEnabled(this.analytics, false);
    } catch {
      // analytics is non-essential — fail silently
    }
  }
}
