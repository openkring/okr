import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

import { CalEventModel } from '@okr/shared-models';
import { buildGoogleCalendarUrl } from '@okr/calevent-util';

const FEED_URL = 'https://europe-west6-bkaiser-org.cloudfunctions.net/calendarFeed';
const PUBLIC_ICS_URL = 'https://europe-west6-bkaiser-org.cloudfunctions.net/generateCalendarICS';

type Device = 'ios' | 'android' | 'desktop';

/**
 * Client entry point for the ICS subscription feature (spec 2026-08-23-calendar-sync): fetches
 * the per-user feed token via the `ensureCalendarFeedToken` callable (Task 4, AppCheck-enforced,
 * `europe-west6`) and builds the `webcal://` subscription URL served by the `calendarFeed`
 * function (Task 5).
 *
 * Follows the repo's established callable-client convention (no `@angular/fire` wrapper exists
 * in this codebase — see `FeatureSelectionService`/`PersonService`): a plain `firebase/functions`
 * `httpsCallable` against the `europe-west6` region. The `firebase/functions` import is dynamic
 * (rather than a module-level `getFunctions(getApp(), …)` field like `FeatureSelectionService`)
 * so this service stays safe to construct during SSR, where `getApp()` may not be initialised yet.
 */
@Injectable({ providedIn: 'root' })
export class CalendarFeedService {
  /**
   * Fetches (or, with `regenerate`, rotates) the caller's feed token. Errors are not caught
   * here — this is a user-initiated action; the caller (the sync modal) decides how to surface
   * a failure (offline, AppCheck rejection, unauthenticated).
   */
  public async ensureToken(regenerate = false): Promise<string> {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const fn = httpsCallable<{ regenerate: boolean }, { token: string }>(
      getFunctions(undefined, 'europe-west6'), 'ensureCalendarFeedToken');
    return (await fn({ regenerate })).data.token;
  }

  /**
   * Builds the subscription URL for one calendar selection. Uses `webcal://` rather than
   * `https://` — that is the scheme Apple Calendar and Outlook use to recognise a live
   * subscription and offer "Abonnieren" instead of just downloading the file once. The URL is
   * never navigated to directly here (only copied to the clipboard via the sync modal's copy
   * button), so the "unregistered protocol" failure mode a browser hits when *following* a
   * `webcal://` link does not apply — the user pastes it into their calendar app's "Add by
   * URL"/"Subscribe" field, which all three major clients (Apple Calendar, Outlook, Google
   * Calendar) accept.
   */
  public feedUrl(token: string, calendarKey: string): string {
    return `${FEED_URL.replace(/^https:\/\//, 'webcal://')}?token=${encodeURIComponent(token)}&calendar=${encodeURIComponent(calendarKey)}`;
  }

  /**
   * «Zum Kalender hinzufügen» for one event. There is no web API that writes into the device
   * calendar, so each platform gets the path that ends in its own calendar UI:
   * - iOS: same-tab navigation to an `inline` ICS → iOS shows the event preview with «Hinzufügen».
   * - Android: the Google Calendar "add event" link → the Google Calendar app, pre-filled.
   * - Desktop: the `.ics` download (`attachment`), opened by the default calendar app.
   *
   * Never `window.open` after the ActionSheet's `await`: the user gesture has expired by then and
   * iOS Safari blocks the popup without a word — that was the "nothing happens" bug. A same-tab
   * navigation to a non-HTML response needs no gesture and leaves the app page in place.
   *
   * @param authenticated with a user, the event is fetched through the token-authenticated feed
   *   (members-only events work too); without one, only events in open calendars are exportable.
   */
  public async addEventToCalendar(calevent: CalEventModel, authenticated: boolean): Promise<void> {
    const device = this.device();
    if (device === 'android') {
      const google = buildGoogleCalendarUrl(calevent);
      if (google) return this.open(google, true);
    }
    return this.open(await this.icsUrl(`e:${calevent.okey}`, device, authenticated), false);
  }

  /** Same as addEventToCalendar, for a whole calendar (a one-off import, not a subscription). */
  public async addCalendarToCalendar(calendarKey: string, authenticated: boolean): Promise<void> {
    return this.open(await this.icsUrl(calendarKey, this.device(), authenticated), false);
  }

  private async icsUrl(calendarParam: string, device: Device, authenticated: boolean): Promise<string> {
    // iOS needs `inline` to show the preview; everywhere else a download is what the user expects.
    const inline = device === 'ios';
    if (authenticated) {
      try {
        const token = await this.ensureToken();
        const disposition = inline ? '' : '&disposition=attachment';
        return `${FEED_URL}?token=${encodeURIComponent(token)}&calendar=${encodeURIComponent(calendarParam)}${disposition}`;
      } catch (err) {
        // Offline/AppCheck hiccup: fall back to the public endpoint, which still serves open calendars.
        console.warn('CalendarFeedService.icsUrl: no feed token, falling back to the public export', err);
      }
    }
    const disposition = inline ? '&disposition=inline' : '';
    return `${PUBLIC_ICS_URL}?calendar=${encodeURIComponent(calendarParam)}${disposition}`;
  }

  private async open(url: string, newTab: boolean): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
      return;
    }
    // A new tab only for a web page (Google Calendar); fall back to the same tab if it was blocked.
    if (newTab && window.open(url, '_blank')) return;
    window.location.href = url;
  }

  private device(): Device {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios' || platform === 'android') return platform;
    const ua = navigator.userAgent;
    // iPadOS reports itself as a Mac; the touch points give it away.
    if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
  }
}
