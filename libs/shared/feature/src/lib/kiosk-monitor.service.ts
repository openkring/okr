import { DestroyRef, inject, Injectable } from '@angular/core';
import { captureMessage } from '@sentry/angular';

import { sendSentryCheckIn, SentryMonitorConfig } from '@okr/shared-util-angular';

import {
  emptyKioskJournal,
  KIOSK_CHECKIN_INTERVAL_MS,
  KioskEventKind,
  KioskJournal,
  kioskMonitorSlug,
  KioskOutage,
  markKioskReached,
  recordKioskEvent,
  tickKioskJournal,
} from './kiosk-journal';

const JOURNAL_KEY = 'okr-kiosk-journal';

/**
 * The Logbuch outage alarm. Sentry expects a check-in every 5' during boathouse hours and opens
 * an issue after three misses (~15-20'). Outside these hours the kiosk still checks in; Sentry
 * simply expects nothing then, so a kiosk that is off at night stays quiet.
 */
const KIOSK_MONITOR: SentryMonitorConfig = {
  schedule: { type: 'crontab', value: '*/5 6-21 * * *' },
  checkin_margin: 5,
  timezone: 'Europe/Zurich',
  failure_issue_threshold: 3,
  recovery_threshold: 1,
};

/**
 * Watches a kiosk device from the inside and reports its outages to Sentry — both THAT it was
 * gone (a Sentry Crons monitor, see KIOSK_MONITOR) and, once it is back, WHY (one event carrying
 * the kiosk journal, see kiosk-journal.ts).
 *
 * Started by KioskStatusService for kiosk-only users only; never runs for a normal member.
 */
@Injectable({ providedIn: 'root' })
export class KioskMonitorService {
  private timer?: ReturnType<typeof setInterval>;
  private slug = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.timer);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
    });
  }

  public start(tenantId: string, uid: string): void {
    if (this.timer) return;
    this.slug = kioskMonitorSlug(tenantId, uid);
    this.record('boot');
    if (!navigator.onLine) this.record('offline');
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), KIOSK_CHECKIN_INTERVAL_MS);
  }

  private readonly onVisibilityChange = (): void => {
    const visible = document.visibilityState === 'visible';
    this.record(visible ? 'visible' : 'hidden');
    if (visible) void this.tick();
  };

  private readonly onOnline = (): void => {
    this.record('online');
    void this.tick();
  };

  private readonly onOffline = (): void => this.record('offline');

  /**
   * Note that the page is alive, check in, and — if this is the first check-in to get through
   * after a long gap — report the outage. The journal is re-read AFTER the await, so two ticks
   * racing (timer + wake) cannot both report the same gap.
   */
  private async tick(): Promise<void> {
    this.write(tickKioskJournal(this.read(), new Date().toISOString()));
    if (!(await sendSentryCheckIn(this.slug, KIOSK_MONITOR))) return;
    const { journal, outage } = markKioskReached(this.read(), new Date().toISOString());
    this.write(journal);
    if (outage) this.report(outage);
  }

  private report(outage: KioskOutage): void {
    captureMessage(`Kiosk outage: ${outage.minutes} min (${outage.cause})`, {
      level: 'warning',
      // one issue per cause and device, not one per gap length
      fingerprint: ['kiosk-outage', this.slug, outage.cause],
      tags: { kioskOutageCause: outage.cause, kioskMonitor: this.slug },
      extra: {
        from: outage.from,
        to: outage.to,
        fromLocal: toZurichTime(outage.from),
        toLocal: toZurichTime(outage.to),
        minutes: outage.minutes,
        journal: outage.events.map(e =>
          `${toZurichTime(e.at)} ${e.kind}${e.ms ? ` ${Math.round(e.ms / 60_000)} min` : ''}`),
      },
    });
  }

  private record(kind: KioskEventKind): void {
    this.write(recordKioskEvent(this.read(), kind, new Date().toISOString()));
  }

  // localStorage can throw (storage blocked, quota) — telemetry must never break the kiosk
  private read(): KioskJournal {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      return raw ? { ...emptyKioskJournal(), ...(JSON.parse(raw) as KioskJournal) } : emptyKioskJournal();
    } catch {
      return emptyKioskJournal();
    }
  }

  private write(journal: KioskJournal): void {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    } catch {
      // ignore, see read()
    }
  }
}

function toZurichTime(iso: string): string {
  return new Date(iso).toLocaleString('de-CH', { timeZone: 'Europe/Zurich' });
}
