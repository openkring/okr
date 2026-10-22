import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { filter, map, merge, take, timer } from 'rxjs';

import { JournalDb } from '@okr/travel-journal-data-access';
import { shouldOpenJournalOnLaunch } from '@okr/travel-journal-util';

/**
 * Opens the travel journal on an offline cold start (spec 1.113, spike S3): offline on iOS the normal
 * start page cannot load and shows 404, the journal works from SQLite. Waits for the router's first
 * NavigationEnd — navigating earlier loses against the start navigation (the race seen in S3) — or,
 * if the start navigation hangs (a guard waiting for app-config), for a fallback timeout.
 */
const FALLBACK_MS = 4000;

@Injectable({ providedIn: 'root' })
export class JournalLaunchService {
  private readonly router = inject(Router);
  private readonly db = inject(JournalDb);
  private started = false;

  public start(): void {
    if (this.started || !Capacitor.isNativePlatform()) return;
    this.started = true;
    merge(
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects)),
      timer(FALLBACK_MS).pipe(map(() => this.router.url)),
    )
      .pipe(take(1))
      .subscribe((url) => void this.decide(url));
  }

  private async decide(currentUrl: string): Promise<void> {
    try {
      const [status, launch, hasJournal] = await Promise.all([
        Network.getStatus(),
        App.getLaunchUrl().catch(() => undefined),
        this.db.hasAnyJournal(),
      ]);
      const open = shouldOpenJournalOnLaunch({
        native: true, online: status.connected, hasJournal, launchUrl: launch?.url, currentUrl,
      });
      if (open) await this.router.navigateByUrl('/journal');
    } catch {
      // never block the app's start over the journal
    }
  }
}
