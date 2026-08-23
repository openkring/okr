import { Injectable } from '@angular/core';

const FEED_URL = 'https://europe-west6-bkaiser-org.cloudfunctions.net/calendarFeed';

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
    return `${FEED_URL.replace(/^https:\/\//, 'webcal://')}?token=${token}&calendar=${encodeURIComponent(calendarKey)}`;
  }
}
