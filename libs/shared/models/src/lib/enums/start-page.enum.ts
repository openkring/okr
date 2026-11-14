/**
 * The page a user lands on when they open the app without choosing one (profile setting).
 * `Default` = the tenant's `app-config.rootUrl`. The URL each value opens lives in
 * `START_PAGE_URLS` (`@okr/shared-util-core`) — the user doc stores the choice, never a URL,
 * so a moved route does not strand anyone.
 */
export enum StartPage {
  Default,
  Welcome,
  Members,
  MyCalendar,
  MyTasks,
  Dashboard,
  Emergency,
  Logbuch,
}
