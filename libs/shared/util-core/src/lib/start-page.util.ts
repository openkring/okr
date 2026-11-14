import { StartPage } from '@okr/shared-models';

/**
 * Where each start page leads. The user doc stores the `StartPage` value, never the URL, so a
 * route can move here without a migration. `Default` has no URL: it is the tenant's `rootUrl`.
 */
export const START_PAGE_URLS: Record<StartPage, string> = {
  [StartPage.Default]: '',
  [StartPage.Welcome]: '/private/welcome/c-contentpage',
  [StartPage.Members]: '/person/all/c-persons',
  [StartPage.MyCalendar]: '/calevent/my/c-calevents',
  [StartPage.MyTasks]: '/task/my/c-tasks',
  [StartPage.Dashboard]: '/private/dashboard/c-contentpage',
  [StartPage.Emergency]: '/private/notfall_content/c-contentpage',
  [StartPage.Logbuch]: '/trips/logbuch/c-trips',
};

/**
 * The feature block a start page needs (`feature-blocks.ts`), or '' when it is always there.
 * Same ids as `FeatureStore.isEnabled`.
 */
export const START_PAGE_BLOCKS: Record<StartPage, string> = {
  [StartPage.Default]: '',
  [StartPage.Welcome]: 'cms',
  [StartPage.Members]: 'subject',
  [StartPage.MyCalendar]: 'calevent',
  [StartPage.MyTasks]: 'task',
  [StartPage.Dashboard]: 'cms',
  [StartPage.Emergency]: 'chat',
  [StartPage.Logbuch]: 'trip',
};

/**
 * `groups/<okey>` of the group that answers the emergency button — the document id, not the
 * display name: names are neither unique across tenants nor stable when an admin renames the
 * group. Without this group the tenant has no emergency page.
 */
export const EMERGENCY_GROUP_KEY = 'notfall';

export interface StartPageContext {
  /** Is this feature block effective for the tenant? */
  isEnabled: (blockId: string) => boolean;
  /** Does the tenant have the emergency group (and so the emergency page)? */
  hasEmergencyGroup: boolean;
}

/** May the tenant offer this start page? `Default` always. */
export function isStartPageAvailable(page: StartPage, ctx: StartPageContext): boolean {
  if (page === StartPage.Default) return true;
  if (!(page in START_PAGE_URLS)) return false;
  if (page === StartPage.Emergency && !ctx.hasEmergencyGroup) return false;
  const block = START_PAGE_BLOCKS[page];
  return !block || ctx.isEnabled(block);
}

/**
 * The URL a user lands on without choosing one: their own start page, else the tenant's `rootUrl`.
 * A missing, unknown or `Default` value falls back (legacy user docs lack the field).
 * Feature availability is NOT checked here: a page whose block was switched off later is caught
 * by the route's own feature guard, which redirects to `rootUrl`.
 */
export function resolveStartUrl(startPage: StartPage | undefined | null, rootUrl: string): string {
  if (startPage === undefined || startPage === null) return rootUrl;
  const url = START_PAGE_URLS[startPage as StartPage];
  return url ? url : rootUrl;
}

/** The two `UserModel` fields of spec 1.158 (structural, so util-core needs no UserModel). */
export interface DepartureState {
  startPage?: StartPage | null;
  emergencyOnDeparture?: boolean;
  activeTripKey?: string;
}

/** Is the user on an open Logbuch trip and opted in to the Notfall page for it (spec 1.158 §2.3)? */
export function isOnDepartureTrip(user: DepartureState | undefined | null): boolean {
  return !!user?.emergencyOnDeparture && !!user.activeTripKey;
}

/**
 * `resolveStartUrl` for a user: while they are crew of an open Logbuch trip and opted in, the Notfall page wins over
 * their own start page (spec 1.158 §2.3). The trigger only sets `activeTripKey` where the tenant has the Logbuch.
 */
export function resolveUserStartUrl(user: DepartureState | undefined | null, rootUrl: string): string {
  if (isOnDepartureTrip(user)) return START_PAGE_URLS[StartPage.Emergency];
  return resolveStartUrl(user?.startPage, rootUrl);
}

/** May the tenant offer the «Notfall-Seite bei Ausfahrt» checkbox: Logbuch on, and the Notfall page available. */
export function isDepartureEmergencyAvailable(ctx: StartPageContext): boolean {
  return ctx.isEnabled(START_PAGE_BLOCKS[StartPage.Logbuch]) && isStartPageAvailable(StartPage.Emergency, ctx);
}

/** What the in-app jump of spec 1.158 §2.3 remembers between two user-doc emissions. */
export interface DepartureSeen {
  uid: string;
  activeTripKey: string;
}

/**
 * Should an app that is already open jump to the Notfall page now (spec 1.158 §2.3, D4)? Only on a change from no
 * open trip to one, for the same user, with the opt-in on. The first emission of a user is the baseline: an app
 * started during a trip lands on the Notfall page through the start-page guard instead, and a deep link keeps its
 * page. Ending the trip never navigates. Pure.
 */
export function shouldJumpToEmergency(
  previous: DepartureSeen | undefined,
  user: (DepartureState & { okey?: string }) | undefined | null,
): boolean {
  if (!user?.okey || !previous || previous.uid !== user.okey) return false;
  return previous.activeTripKey === '' && isOnDepartureTrip(user);
}
