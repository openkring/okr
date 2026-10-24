import { Route } from '@angular/router';
import { isAuthenticatedGuard } from '@okr/auth-feature';

/**
 * The travel journal's routes (spec 1.113). They are mounted in the app's route table BEFORE the
 * isAppReadyGuard parent and outside the feature catalogue: that guard and the feature gate need
 * app-config, which an offline cold start does not have (spike S3). Only the Firebase sign-in is
 * required, and it is restored offline.
 */
/** The pages under /journal; the feature catalogue lazy-loads these (loadChildren), the app mounts JOURNAL_ROUTES. */
export const JOURNAL_CHILD_ROUTES: Route[] = [
  { path: '', loadComponent: () => import('./journal-list.page').then((m) => m.JournalListPage) },
  { path: ':journalKey', loadComponent: () => import('./journal-overview.page').then((m) => m.JournalOverviewPage) },
  { path: ':journalKey/:footprintKey', loadComponent: () => import('./journal-story.page').then((m) => m.JournalStoryPage) },
];

export const JOURNAL_ROUTES: Route[] = [
  { path: 'journal', canActivate: [isAuthenticatedGuard], children: JOURNAL_CHILD_ROUTES },
  // the guest's personal link (plan 7): no sign-in — the link code is the credential of the journalGuest callable
  { path: 'g/:journalKey/:code', loadComponent: () => import('./journal-guest.page').then((m) => m.JournalGuestPage) },
];
